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
        // NOTE: All keys in this map must be lowercase to ensure consistent lookup and filtering.
        const chargeState = {
            batterylevel: "charge_state/battery_level",
            soc: "charge_state/battery_level", // alias
            ratedrange: "charge_state/battery_range",
            idealbatteryrange: "charge_state/ideal_battery_range",
            estbatteryrange: "charge_state/est_battery_range",
            chargeenergyadded: "charge_state/charge_energy_added",
            chargervoltage: "charge_state/charger_voltage",
            chargerpower: "charge_state/charger_power",
            chargerphases: "charge_state/charger_phases",
            chargeractualcurrent: "charge_state/charger_actual_current",
            chargelimitsoc: "charge_state/charge_limit_soc",
            chargeportdooropen: "charge_state/charge_port_door_open",
            chargeportlatch: "charge_state/charge_port_latch",
            chargingstate: "charge_state/charging_state",
            ischarging: "charge_state/charging_state", // alias
            timetofullcharge: "charge_state/time_to_full_charge",
            fastchargerpresent: "charge_state/fast_charger_present",
            scheduledchargingpending: "charge_state/scheduled_charging_pending",
            scheduledchargingstarttime: "charge_state/scheduled_charging_start_time",
            energyremaining: "charge_state/energy_remaining",
            packvoltage: "charge_state/pack_voltage",
            packcurrent: "charge_state/pack_current",
            batterycurrent: "charge_state/battery_current",
            batteryvoltage: "charge_state/battery_voltage",
            moduletempmin: "charge_state/module_temp_min",
            moduletempmax: "charge_state/module_temp_max",
            lifetimeenergyused: "charge_state/lifetime_energy_used",
            chargecurrentrequestmax: "charge_state/charge_current_request_max",
            chargecurrentrequest: "charge_state/charge_current_request",
            chargeamps: "charge_state/charge_amps"
        };

        const driveState = {
            speed: "drive_state/speed",
            vehiclespeed: "drive_state/speed", // alias
            power: "drive_state/power",
            shiftstate: "drive_state/shift_state",
            heading: "drive_state/heading",
            gpsheading: "drive_state/heading", // alias
            latitude: "drive_state/latitude",
            longitude: "drive_state/longitude",
            milestoarrival: "drive_state/active_route_miles_to_arrival",
            minutestoarrival: "drive_state/active_route_minutes_to_arrival",
            destinationname: "drive_state/active_route_destination",
            expectedenergypercentattriparrival: "drive_state/active_route_energy_at_arrival"
        };

        const climateState = {
            insidetemp: "climate_state/inside_temp",
            outsidetemp: "climate_state/outside_temp",
            drivertempsetting: "climate_state/driver_temp_setting",
            passengertempsetting: "climate_state/passenger_temp_setting",
            isautoconditioningon: "climate_state/is_auto_conditioning_on",
            fanstatus: "climate_state/fan_status",
            isfrontdefrosteron: "climate_state/is_front_defroster_on",
            isreardefrosteron: "climate_state/is_rear_defroster_on",
            batteryheater: "climate_state/battery_heater",
            batteryheateron: "climate_state/battery_heater_on",
            batteryheateractive: "climate_state/battery_heater_on",
            isclimateon: "climate_state/is_climate_on",
            ispreconditioning: "climate_state/is_preconditioning",
            cabinoverheatprotection: "climate_state/cabin_overheat_protection",
            hvacsteeringwheelheatlevel: "climate_state/steering_wheel_heat_level",
            climateseatcoolingfrontleft: "climate_state/seat_heater_left", 
            climateseatcoolingfrontright: "climate_state/seat_heater_right", 
            hvaclefttemperaturerequest: "climate_state/driver_temp_setting", 
            seatheaterleft: "climate_state/seat_heater_left",
            seatheaterright: "climate_state/seat_heater_right",
            seatheaterrearleft: "climate_state/seat_heater_rear_left",
            seatheaterrearright: "climate_state/seat_heater_rear_right",
            seatheaterrearcenter: "climate_state/seat_heater_rear_center"
        };

        const vehicleState = {
            odometer: "vehicle_state/odometer",
            isuserpresent: "vehicle_state/is_user_present",
            isdriverpresent: "vehicle_state/is_driver_present",
            isvehiclelocked: "vehicle_state/locked",
            tpmspressurefrontleft: "vehicle_state/tpms_pressure_fl",
            tpmspressurefrontright: "vehicle_state/tpms_pressure_fr",
            tpmspressurerearleft: "vehicle_state/tpms_pressure_rl",
            tpmspressurerearright: "vehicle_state/tpms_pressure_rr",
            tpmspressurefl: "vehicle_state/tpms_pressure_fl",
            tpmspressurefr: "vehicle_state/tpms_pressure_fr",
            tpmspressurerl: "vehicle_state/tpms_pressure_rl",
            tpmspressurerr: "vehicle_state/tpms_pressure_rr",
            softwareupdateversion: "vehicle_state/software_update/version",
            softwareupdatedownloadpercentcomplete: "vehicle_state/software_update/download_perc",
            softwareupdateinstallationpercentcomplete: "vehicle_state/software_update/install_perc",
            currentlimitmph: "vehicle_state/speed_limit_mode/current_limit_mph",
            vehiclename: "vehicle_state/vehicle_name",
            version: "vehicle_state/car_version",
            mediaaudiovolumemax: "vehicle_state/media_info/audio_volume_max",
            medianowplayingalbum: "vehicle_state/media_info/now_playing_album",
            medianowplayingartist: "vehicle_state/media_info/now_playing_artist",
            medianowplayingtitle: "vehicle_state/media_info/now_playing_title",
            medianowplayingstation: "vehicle_state/media_info/now_playing_station",
            medianowplayingelapsed: "vehicle_state/media_info/now_playing_elapsed",
            medianowplayingduration: "vehicle_state/media_info/now_playing_duration",
            mediaplaybacksource: "vehicle_state/media_info/now_playing_source",
            mediaaudiovolume: "vehicle_state/media_info/audio_volume",
            mediaaudiovolumeincrement: "vehicle_state/media_info/audio_volume_increment"
        };

        const vehicleConfigMap = {
            wheeltype: "vehicle_config/wheel_type"
        };

        const misc = {
            timestamp: "timestamp",
            acchargingpower: "charge_state/ac_charging_power",
            batteryheateron: "climate_state/battery_heater_on",
            chargeenablerequest: "charge_state/charge_enable_request",
            chargeportdooropen: "charge_state/charge_port_door_open",
            chargeportlatch: "charge_state/charge_port_latch",
            driverseatoccupied: "vehicle_state/driver_seat_occupied",
            fastchargertype: "charge_state/fast_charger_type",
            locked: "vehicle_state/locked",
            speedlimitmode: "vehicle_state/speed_limit_mode/enabled",
            timetofullcharge: "charge_state/time_to_full_charge",
            tpmslastseenpressuretimefl: "vehicle_state/tpms_last_seen_pressure_time_fl",
            tpmslastseenpressuretimefr: "vehicle_state/tpms_last_seen_pressure_time_fr",
            tpmslastseenpressuretimerr: "vehicle_state/tpms_last_seen_pressure_time_rr",
            valetmodeenabled: "vehicle_state/valet_mode_enabled",
            vehiclespeed: "drive_state/speed" // already aliased, included for completeness
        };

        const streamingKeyMap = {
            ...chargeState,
            ...driveState,
            ...climateState,
            ...vehicleState,
            ...vehicleConfigMap,
            ...misc
        };

        const compoundEnumKeys = {
            detailedchargestate: {
                prop: "detailedChargeStateValue",
                prefix: "DetailedChargeState",
                topic: "charge_state/detailed_charge_state"
            },
            chargeportlatch: {
                prop: "chargePortLatchValue",
                prefix: "ChargePortLatch",
                topic: "charge_state/charge_port_latch"
            },
            chargingcabletype: {
                prop: "cableTypeValue",
                prefix: "CableType",
                topic: "charge_state/charging_cable_type"
            },
            climatekeepermode: {
                prop: "climateKeeperModeValue",
                prefix: "ClimateKeeperModeState",
                topic: "climate_state/climate_keeper_mode"
            },
            cabinoverheatprotectionmode: {
                prop: "cabinOverheatProtectionModeValue",
                prefix: "CabinOverheatProtectionModeState",
                topic: "climate_state/cabin_overheat_protection_mode"
            },
            cabinoverheatprotectiontemperaturelimit: {
                prop: "cabinOverheatProtectionTemperatureLimitValue",
                prefix: "ClimateOverheatProtectionTempLimit",
                topic: "climate_state/cabin_overheat_protection_temp_limit"
            },
            defrostmode: {
                prop: "defrostModeValue",
                prefix: "DefrostModeState",
                topic: "climate_state/defrost_mode"
            },
            gear: {
                prop: "shiftStateValue",
                prefix: "ShiftState",
                topic: "drive_state/shift_state"
            },
            hvacpower: {
                prop: "hvacPowerValue",
                prefix: "HvacPowerState",
                topic: "climate_state/hvac_power"
            },
            mediaplaybackstatus: {
                prop: "mediaStatusValue",
                prefix: "MediaStatus",
                topic: "vehicle_state/media_info/playback_status"
            },
            scheduledchargingmode: {
                prop: "scheduledChargingModeValue",
                prefix: "ScheduledChargingMode",
                topic: "charge_state/scheduled_charging_mode"
            },
            sentrymode: {
                prop: "sentryModeStateValue",
                prefix: "SentryModeState",
                topic: "vehicle_state/sentry_mode"
            }
        };


        const nestedObjectKeys = {
            doorstate: {
                prop: "doorValue",
                baseTopic: "vehicle_state/door_state",
                subfields: true
            },
            location: {
                prop: "locationValue",
                baseTopic: "drive_state/location",
                subfields: true
            },
            destinationlocation: {
                prop: "locationValue",
                baseTopic: "drive_state/active_route_destination_location",
                subfields: true
            }
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
            if ('invalid' in valueObj && valueObj.invalid === true) return null;
            if ('doubleValue' in valueObj) return valueObj.doubleValue;
            if ('intValue' in valueObj) return valueObj.intValue;
            if ('longValue' in valueObj) return parseInt(valueObj.longValue);
            if ('stringValue' in valueObj) return valueObj.stringValue;
            if ('boolValue' in valueObj) return valueObj.boolValue;
            if ('booleanValue' in valueObj) return valueObj.booleanValue;
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
                                const key = item.key.toLowerCase();

                                if (compoundEnumKeys[key]) {
                                    const { prop, prefix, topic } = compoundEnumKeys[key];
                                    const raw = item.value?.[prop];
                                    if (raw && raw.startsWith(prefix)) {
                                        const state = raw.replace(prefix, "");
                                        node.send([{ topic: `${topicRoot}/${vehicleName}/${topic}`, payload: state }, null]);
                                        return;
                                    }
                                }

                                const windowMap = {
                                    fpwindow: "front_passenger",
                                    fdwindow: "front_driver",
                                    rdwindow: "rear_driver",
                                    rpwindow: "rear_passenger"
                                };
                                if (key in windowMap && item.value?.windowStateValue) {
                                    const state = item.value.windowStateValue.replace("WindowState", "");
                                    node.send([{ topic: `${topicRoot}/${vehicleName}/vehicle_state/window_state/${windowMap[key]}`, payload: state }, null]);
                                    return;
                                }

                                if (nestedObjectKeys[key]) {
                                    const { prop, baseTopic, subfields } = nestedObjectKeys[key];
                                    const nested = item.value?.[prop];
                                    if (nested && typeof nested === "object") {
                                        // Publish full object
                                        node.send([{ topic: `${topicRoot}/${vehicleName}/${baseTopic}`, payload: JSON.stringify(nested) }, null]);
                                        // Publish each subfield
                                        if (subfields) {
                                            Object.entries(nested).forEach(([subKey, subVal]) => {
                                                const topic = `${topicRoot}/${vehicleName}/${baseTopic}/${subKey.toLowerCase()}`;
                                                node.send([{ topic, payload: convertUnits(topic, subVal) }, null]);
                                            });
                                        }
                                        return;
                                    }
                                }

                                const val = extractValue(item.value);
                                const mappedPath = streamingKeyMap[key];
                                const topicPath = mappedPath || key;
                                if (val === undefined && debug) {
                                    node.log(`Streaming key ${key} had undefined value: ${JSON.stringify(item.value)}`);
                                }

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
                    
                        if ("drive_state/latitude" in flattened && "drive_state/longitude" in flattened) {
                            const lat = flattened["drive_state/latitude"];
                            const lon = flattened["drive_state/longitude"];
                            node.send([{
                            topic: `${topicRoot}/${vehicleName}/drive_state/location`,
                            payload: JSON.stringify({ latitude: lat, longitude: lon })
                            }, null]);
                        }
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
