module.exports = function (RED) {
    const WebSocket = require('ws');
    const axios = require('axios');

    function TessieStreamingNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        node.status({ fill: "gray", shape: "ring", text: "Waiting for start signal" });

        let isStarting = false;
        let isRunning = false;
        let manualStop = false;
        let streamingHealthy = false;
        let refreshHealthy = false;
        
        const vehicleConfig = RED.nodes.getNode(config.vehicle);
        const serverConfig = RED.nodes.getNode(config.server);
        const streamConfig = RED.nodes.getNode(config.streamServer);

        const vehicleName = vehicleConfig.name;
        const vin = vehicleConfig.vin;
        const queryToken = serverConfig.token;
        const streamToken = streamConfig.token;
        const baseUrl = serverConfig.baseUrl.replace(/\/+$/, "");
        const streamBaseURL = streamConfig.baseUrl.replace(/\/+$/, "");

        const topicRoot = config.topicRoot || "tessie-api";
        const refreshInterval = parseInt(config.refreshInterval) || 300;
        const debug = config.debug;
        const units = config.units || "metric";
        const autoStart = config.autoStart;
        const groupOutput = config.groupOutput;

        const whitelist = (config.whitelist || "").split(",").map(s => s.trim()).filter(Boolean);
        const blacklist = (config.blacklist || "").split(",").map(s => s.trim()).filter(Boolean);



        //map streaming keys to REST API keys
        const chargeState = {
            BatteryLevel: "charge_state/battery_level",
            Soc: "charge_state/battery_level", // alias
            RatedRange: "charge_state/battery_range",
            IdealBatteryRange: "charge_state/ideal_battery_range",
            EstBatteryRange: "charge_state/est_battery_range",
            ChargeEnergyAdded: "charge_state/charge_energy_added",
            ChargerVoltage: "charge_state/charger_voltage",
            ChargerPower: "charge_state/charger_power",
            ChargerPhases: "charge_state/charger_phases",
            ChargerActualCurrent: "charge_state/charger_actual_current",
            ChargeLimitSoc: "charge_state/charge_limit_soc",
            ChargePortDoorOpen: "charge_state/charge_port_door_open",
            ChargePortLatch: "charge_state/charge_port_latch",
            ChargingState: "charge_state/charging_state",
            IsCharging: "charge_state/charging_state", // alias
            TimeToFullCharge: "charge_state/time_to_full_charge",
            FastChargerPresent: "charge_state/fast_charger_present",
            ScheduledChargingPending: "charge_state/scheduled_charging_pending",
            ScheduledChargingStartTime: "charge_state/scheduled_charging_start_time",
            EnergyRemaining: "charge_state/energy_remaining",
            PackVoltage: "charge_state/pack_voltage",
            PackCurrent: "charge_state/pack_current",
            BatteryCurrent: "charge_state/battery_current",
            BatteryVoltage: "charge_state/battery_voltage",
            ModuleTempMin: "charge_state/module_temp_min",
            ModuleTempMax: "charge_state/module_temp_max",
            LifetimeEnergyUsed: "charge_state/lifetime_energy_used",
            ChargeCurrentRequestMax: "charge_state/charge_current_request_max",
            ChargeCurrentRequest: "charge_state/charge_current_request",
            ChargeAmps: "charge_state/charge_amps"
        };

        const driveState = {
            Speed: "drive_state/speed",
            VehicleSpeed: "drive_state/speed", // alias
            Power: "drive_state/power",
            ShiftState: "drive_state/shift_state",
            Heading: "drive_state/heading",
            GpsHeading: "drive_state/heading", // alias
            Latitude: "drive_state/latitude",
            Longitude: "drive_state/longitude",
            MilesToArrival: "drive_state/active_route_miles_to_arrival",
            MinutesToArrival: "drive_state/active_route_minutes_to_arrival",
            DestinationName: "drive_state/active_route_destination",
            ExpectedEnergyPercentAtTripArrival: "drive_state/active_route_energy_at_arrival"
        };

        const climateState = {
            InsideTemp: "climate_state/inside_temp",
            OutsideTemp: "climate_state/outside_temp",
            DriverTempSetting: "climate_state/driver_temp_setting",
            PassengerTempSetting: "climate_state/passenger_temp_setting",
            IsAutoConditioningOn: "climate_state/is_auto_conditioning_on",
            FanStatus: "climate_state/fan_status",
            IsFrontDefrosterOn: "climate_state/is_front_defroster_on",
            IsRearDefrosterOn: "climate_state/is_rear_defroster_on",
            BatteryHeater: "climate_state/battery_heater",
            BatteryHeaterOn: "climate_state/battery_heater_on",
            BatteryHeaterActive: "climate_state/battery_heater_on",
            IsClimateOn: "climate_state/is_climate_on",
            IsPreconditioning: "climate_state/is_preconditioning",
            CabinOverheatProtection: "climate_state/cabin_overheat_protection",
            HvacSteeringWheelHeatLevel: "climate_state/steering_wheel_heat_level",
            ClimateSeatCoolingFrontLeft: "climate_state/seat_heater_left", 
            ClimateSeatCoolingFrontRight: "climate_state/seat_heater_right", 
            HvacLeftTemperatureRequest: "climate_state/driver_temp_setting", 
            SeatHeaterLeft: "climate_state/seat_heater_left",
            SeatHeaterRight: "climate_state/seat_heater_right",
            SeatHeaterRearLeft: "climate_state/seat_heater_rear_left",
            SeatHeaterRearRight: "climate_state/seat_heater_rear_right",
            SeatHeaterRearCenter: "climate_state/seat_heater_rear_center"
        };

        const vehicleState = {
            Odometer: "vehicle_state/odometer",
            IsUserPresent: "vehicle_state/is_user_present",
            IsDriverPresent: "vehicle_state/is_driver_present",
            IsVehicleLocked: "vehicle_state/locked",
            TpmsPressureFrontLeft: "vehicle_state/tpms_pressure_fl",
            TpmsPressureFrontRight: "vehicle_state/tpms_pressure_fr",
            TpmsPressureRearLeft: "vehicle_state/tpms_pressure_rl",
            TpmsPressureRearRight: "vehicle_state/tpms_pressure_rr",
            SoftwareUpdateVersion: "vehicle_state/software_update/version",
            SoftwareUpdateDownloadPercentComplete: "vehicle_state/software_update/download_perc",
            SoftwareUpdateInstallationPercentComplete: "vehicle_state/software_update/install_perc",
            CurrentLimitMph: "vehicle_state/speed_limit_mode/current_limit_mph",
            VehicleName: "vehicle_state/vehicle_name",
            Version: "vehicle_state/car_version",
            MediaAudioVolumeMax: "vehicle_state/media_info/audio_volume_max",
            MediaNowPlayingAlbum: "vehicle_state/media_info/now_playing_album",
            MediaNowPlayingArtist: "vehicle_state/media_info/now_playing_artist",
            MediaNowPlayingTitle: "vehicle_state/media_info/now_playing_title",
            MediaNowPlayingStation: "vehicle_state/media_info/now_playing_station",
            MediaNowPlayingElapsed: "vehicle_state/media_info/now_playing_elapsed",
            MediaNowPlayingDuration: "vehicle_state/media_info/now_playing_duration",
            MediaPlaybackSource: "vehicle_state/media_info/now_playing_source",
            MediaAudioVolume: "vehicle_state/media_info/audio_volume",
            MediaAudioVolumeIncrement: "vehicle_state/media_info/audio_volume_increment"
        };

        const vehicleConfigMap = {
            WheelType: "vehicle_config/wheel_type"
        };



        const misc = {
          Timestamp: "timestamp"
        };

        // DCChargingPower: "charge_state/dc_charging_power", // TODO: confirm correct mapping
        // ACChargingPower: "charge_state/ac_charging_power", // TODO: confirm correct mapping


        const streamingKeyMap = {
            ...chargeState,
            ...driveState,
            ...climateState,
            ...vehicleState,
            ...vehicleConfigMap,
            ...misc
        };

        let ws;
        let refreshTimer;
        let heartbeatTimer;

        function updateStatus() {
            if (!isRunning) {
                node.status({ fill: "gray", shape: "ring", text: "Stopped" });
            } else if (isStarting) {
                node.status({ fill: "yellow", shape: "ring", text: "Starting..." });
    }        else if (streamingHealthy && refreshHealthy) {
                node.status({ fill: "green", shape: "dot", text: `Connected. Next refresh: ${nextRefreshTime()}` });
            } else {
                const issues = [];
                if (!streamingHealthy) issues.push("streaming");
                if (!refreshHealthy) issues.push("refresh");
                node.status({ fill: "red", shape: "ring", text: `Error: ${issues.join(" & ")} failed` });
            }
        }

        function flattenObject(obj, prefix = "") {
            const result = {};
            for (const key in obj) {
                if (!obj.hasOwnProperty(key)) continue;
                const value = obj[key];
                const fullKey = prefix ? `${prefix}/${key}` : key;
                if (value !== null && typeof value === "object" && !Array.isArray(value)) {
                    Object.assign(result, flattenObject(value, fullKey));
                } else {
                    result[fullKey] = value;
                }
            }
            return result;
        }

        function convertUnits(key, val) {
            const normalizedKey = key.toLowerCase();
            if (units === "imperial") {
               if (normalizedKey.includes("pressure") || normalizedKey.includes("tire")) {
                   return val * 14.5038; // bar to PSI
                }
                if (normalizedKey.includes("speed")) return val * 0.621371;
                if (normalizedKey.includes("temp")) return (val * 9 / 5) + 32;
                if (normalizedKey.includes("range") || normalizedKey.includes("odometer")) return val * 0.621371;
            }
            return val;
        }

        function nextRefreshTime() {
            const now = new Date();
            const next = new Date(now.getTime() + refreshInterval * 1000);
            return next.toLocaleTimeString();
        }

        function extractValue(valueObj) {
            if (!valueObj || typeof valueObj !== 'object') return undefined;
            if ('doubleValue' in valueObj) return valueObj.doubleValue;
            if ('intValue' in valueObj) return valueObj.intValue;
            if ('stringValue' in valueObj) return valueObj.stringValue;
            if ('boolValue' in valueObj) return valueObj.boolValue;
            if ('timestampValue' in valueObj) return valueObj.timestampValue;
            return undefined;
        }

        function connectWebSocket() {
            if (!isRunning) return;
            const url = `${streamBaseURL}/${vin}?access_token=${streamToken}`;
            ws = new WebSocket(url);

            ws.on('open', () => {
                streamingHealthy = true;
                updateStatus();
                if (debug) node.log("WebSocket connected");
            });

            ws.on('message', (data) => {
                try {
                        const parsed = JSON.parse(data);
                        if (Array.isArray(parsed.data)) {
                            parsed.data.forEach(item => {
                                const key = item.key;
                                const val = extractValue(item.value);
                                const mappedPath = streamingKeyMap[key];
                                const topicPath = mappedPath || key;

                                const isSpecificallyWhitelisted = whitelist.some(w => topicPath === w);
                                const isWhitelisted = whitelist.length === 0 || whitelist.some(w => topicPath.startsWith(w));
                                const isBlacklisted = blacklist.some(b => topicPath.startsWith(b));

                                if (val !== undefined && (isSpecificallyWhitelisted || (isWhitelisted && !isBlacklisted))) {
                                    const msgOut = {
                                        topic: `${topicRoot}/${vehicleName}/${topicPath}`,
                                        payload: convertUnits(topicPath, val)
                                    };
                                    node.send([msgOut, null]);

                                    if (!mappedPath && debug) {
                                        node.log(`Unmapped streaming key: ${key} → using fallback topic`);
                                        node.send([null, { payload: `Unmapped streaming key: ${key} → using fallback topic` }]);
                                    }
                                }
                            });
                            if (debug) node.send([null, { payload: parsed }]);
                        } else if (parsed.alerts) {
                            const msgOut = {
                                topic: `${topicRoot}/${vehicleName}/alerts`,
                                payload: JSON.stringify(parsed)
                            };
                            node.send([msgOut, null]);
                        } else if (parsed.connectionId){
                            const msgOut = {
                                topic: `${topicRoot}/${vehicleName}/connectivity`,
                                payload: JSON.stringify(parsed)
                            };
                            node.send([msgOut, null]);
                        } else {
                            //node.warn("WebSocket message received but 'data' is not an array.");
                            if (debug) {
                                node.log("Unexpected WebSocket payload: " + JSON.stringify(parsed));
                            }
                        }
                    } catch (err) {
                    node.error("Error parsing WebSocket message: " + err.message);
                }
            });

            ws.on('close', () => {
                streamingHealthy = false;
                if (manualStop) {
                    node.status({ fill: "gray", shape: "ring", text: "Stopped" });
                    manualStop = false;
                } else {
                    if (!isStarting) updateStatus();
                    if (debug) node.log("WebSocket disconnected. Reconnecting...");
                    setTimeout(connectWebSocket, 5000);
                }
            });

            ws.on('error', (err) => {
                streamingHealthy = false;
                if (!isStarting) updateStatus();
                node.error("WebSocket error: " + err.message);
            });
        }

        function startPeriodicRefresh() {
            if (debug) node.log("startPeriodicRefresh() called");
            if (!isRunning) return;

                if (refreshInterval === 0) {
                    if (debug) node.log("Periodic refresh disabled (interval set to 0)");
                    refreshHealthy = true; // assume healthy since it's intentionally disabled
                    updateStatus();
                    return;
                }                    
                async function doRefresh() {
                try {
                    const url = `${baseUrl}/${vin}/state`;
                    if (debug) node.log(`Requesting vehicle state from: ${url}`);
                    const res = await axios.get(url, {
                        headers: { Authorization: `Bearer ${queryToken}` }
                    });
                    const data = res.data;
                    const flattened = flattenObject(data);
                    const topicPrefix = topicRoot;

                    if (groupOutput) {
                        const groupedPayload = {};
                        for (const key in flattened) {
                            const val = flattened[key];
                            const isSpecificallyWhitelisted = whitelist.some(w => key === w);
                            const isWhitelisted = whitelist.length === 0 || whitelist.some(w => key.startsWith(w));
                            const isBlacklisted = blacklist.some(b => key.startsWith(b));

                            if (isSpecificallyWhitelisted || (isWhitelisted && !isBlacklisted)) {
                                groupedPayload[key] = convertUnits(key, val);
                            }
                        }
                        node.send([{
                            topic: `${topicRoot}/${vehicleName}/state`,
                            payload: groupedPayload
                        }, debug ? { payload: data } : null]);
                    } else {
                        for (const key in flattened) {
                            const val = flattened[key];
                            const isSpecificallyWhitelisted = whitelist.some(w => key === w);
                            const isWhitelisted = whitelist.length === 0 || whitelist.some(w => key.startsWith(w));
                            const isBlacklisted = blacklist.some(b => key.startsWith(b));

                            // Precedence logic: specific whitelist overrides blacklist
                            if (isSpecificallyWhitelisted || (isWhitelisted && !isBlacklisted)) {
                                const topicPath = key;
                                const msgOut = {
                                    topic: `${topicRoot}/${vehicleName}/${topicPath}`,
                                    payload: convertUnits(topicPath, val)
                                };
                                node.send([msgOut, null]);
                            }
                        }
                        if (debug) node.send([null, { payload: data }]);
                    }

                    refreshHealthy = true;
                    isStarting = false;
                    updateStatus();
                } catch (err) {
                    refreshHealthy = false;
                    updateStatus();
                    node.error("Periodic refresh failed: " + (err?.message || err));
                    if (debug) node.log("Full error object: " + JSON.stringify(err, Object.getOwnPropertyNames(err)));
                    }
                }

                // Run once immediately
                doRefresh();

                // Then on interval
                refreshTimer = setInterval(doRefresh, refreshInterval * 1000);
            }


        function startHeartbeat() {
            heartbeatTimer = setInterval(() => {
                if (isRunning) {
                    node.send([{
                        topic: `${topicRoot}/${vehicleName}/heartbeat`,
                        payload: new Date().toISOString()
                    }, null]);
                }
            }, 60000);
        }

        node.on('input', (msg) => {
            const command = (msg.payload || "").toString().toLowerCase();
            if (command === "stop") {
                isRunning = false;
                manualStop = true;
                if (ws) ws.close();
                if (refreshTimer) clearInterval(refreshTimer);
                if (heartbeatTimer) clearInterval(heartbeatTimer);
                updateStatus();
                if (debug) node.log("Streaming stopped");
            }

            if (command === "start") {
                if (!isRunning) {
                    isRunning = true;
                    isStarting = true;
                    connectWebSocket();
                    startPeriodicRefresh();
                    startHeartbeat();
                    updateStatus();
                    if (debug) node.log("Streaming started");
                }
            }
        });

        if (autoStart) {
            isRunning = true;
            isStarting = true;
            connectWebSocket();
            startPeriodicRefresh();
            startHeartbeat();
            updateStatus();
            if (debug) node.log("Auto-start enabled: streaming started");
        }

        node.on('close', () => {
            isRunning = false;
            if (ws) ws.close();
            if (refreshTimer) clearInterval(refreshTimer);
            if (heartbeatTimer) clearInterval(heartbeatTimer);
            updateStatus();
        });
    }

    RED.nodes.registerType("tessie-streaming", TessieStreamingNode);
};
