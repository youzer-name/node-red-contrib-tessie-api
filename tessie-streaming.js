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

        let isVehicleAsleep = false;
        let statusPollTimer = null;

        let lastStreamingMessageTime = Date.now();
        const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
        let inactivityWatchdogTimer;
        let reconnectAttempts = 0;
        let reconnectInProgress = false;

        function safeReconnect(reason = "unspecified") {
            reconnectAttempts++;
            const delay = Math.min(30000, 1000 * Math.pow(2, reconnectAttempts)); // max 30s
            if (debug) node.log(`Reconnecting WebSocket in ${delay / 1000}s due to ${reason} (attempt ${reconnectAttempts})`);
            setTimeout(() => {
                connectWebSocket();
            }, delay);
        }

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
            acchargingpower: "charge_state/ac_charging_power",
            batterycurrent: "charge_state/battery_current",
            batterylevel: "charge_state/battery_level",
            batteryvoltage: "charge_state/battery_voltage",
            chargeamps: "charge_state/charge_amps",
            chargecurrentrequest: "charge_state/charge_current_request",
            chargecurrentrequestmax: "charge_state/charge_current_request_max",
            chargeenergyadded: "charge_state/charge_energy_added",
            chargeenablerequest: "charge_state/charge_enable_request",
            chargelimitsoc: "charge_state/charge_limit_soc",
            chargeractualcurrent: "charge_state/charger_actual_current",
            chargerphases: "charge_state/charger_phases",
            chargerpower: "charge_state/charger_power",
            chargervoltage: "charge_state/charger_voltage",
            chargeportdooropen: "charge_state/charge_port_door_open",
            chargeportlatch: "charge_state/charge_port_latch",
            chargingstate: "charge_state/charging_state",
            energyremaining: "charge_state/energy_remaining",
            estbatteryrange: "charge_state/est_battery_range",
            fastchargerpresent: "charge_state/fast_charger_present",
            fastchargertype: "charge_state/fast_charger_type",
            idealbatteryrange: "charge_state/ideal_battery_range",
            ischarging: "charge_state/charging_state",
            lifetimeenergyused: "charge_state/lifetime_energy_used",
            moduletempmax: "charge_state/module_temp_max",
            moduletempmin: "charge_state/module_temp_min",
            packcurrent: "charge_state/pack_current",
            packvoltage: "charge_state/pack_voltage",
            ratedrange: "charge_state/battery_range",
            scheduledchargingpending: "charge_state/scheduled_charging_pending",
            scheduledchargingstarttime: "charge_state/scheduled_charging_start_time",
            soc: "charge_state/battery_level",
            timetofullcharge: "charge_state/time_to_full_charge"
        };

        const driveState = {
            destinationname: "drive_state/active_route_destination",
            expectedenergypercentattriparrival: "drive_state/active_route_energy_at_arrival",
            gpsheading: "drive_state/heading",
            heading: "drive_state/heading",
            latitude: "drive_state/latitude",
            longitude: "drive_state/longitude",
            milestoarrival: "drive_state/active_route_miles_to_arrival",
            minutestoarrival: "drive_state/active_route_minutes_to_arrival",
            power: "drive_state/power",
            shiftstate: "drive_state/shift_state",
            speed: "drive_state/speed",
            vehiclespeed: "drive_state/speed"
        };

        const climateState = {
            batteryheater: "climate_state/battery_heater",
            batteryheateractive: "climate_state/battery_heater_on",
            batteryheateron: "climate_state/battery_heater_on",
            cabinoverheatprotection: "climate_state/cabin_overheat_protection",
            climateseatcoolingfrontleft: "climate_state/seat_heater_left",
            climateseatcoolingfrontright: "climate_state/seat_heater_right",
            drivertempsetting: "climate_state/driver_temp_setting",
            fanstatus: "climate_state/fan_status",
            hvaclefttemperaturerequest: "climate_state/driver_temp_setting",
            hvacsteeringwheelheatlevel: "climate_state/steering_wheel_heat_level",
            insidetemp: "climate_state/inside_temp",
            isautoconditioningon: "climate_state/is_auto_conditioning_on",
            isclimateon: "climate_state/is_climate_on",
            isfrontdefrosteron: "climate_state/is_front_defroster_on",
            ispreconditioning: "climate_state/is_preconditioning",
            isreardefrosteron: "climate_state/is_rear_defroster_on",
            outsidetemp: "climate_state/outside_temp",
            passengertempsetting: "climate_state/passenger_temp_setting",
            seatheaterleft: "climate_state/seat_heater_left",
            seatheaterright: "climate_state/seat_heater_right",
            seatheaterrearcenter: "climate_state/seat_heater_rear_center",
            seatheaterrearleft: "climate_state/seat_heater_rear_left",
            seatheaterrearright: "climate_state/seat_heater_rear_right"
        };

        const vehicleState = {
            currentlimitmph: "vehicle_state/speed_limit_mode/current_limit_mph",
            driverseatoccupied: "vehicle_state/driver_seat_occupied",
            isdriverpresent: "vehicle_state/is_driver_present",
            isuserpresent: "vehicle_state/is_user_present",
            isvehiclelocked: "vehicle_state/locked",
            locked: "vehicle_state/locked",
            mediaaudiovolume: "vehicle_state/media_info/audio_volume",
            mediaaudiovolumeincrement: "vehicle_state/media_info/audio_volume_increment",
            mediaaudiovolumemax: "vehicle_state/media_info/audio_volume_max",
            medianowplayingalbum: "vehicle_state/media_info/now_playing_album",
            medianowplayingartist: "vehicle_state/media_info/now_playing_artist",
            medianowplayingduration: "vehicle_state/media_info/now_playing_duration",
            medianowplayingelapsed: "vehicle_state/media_info/now_playing_elapsed",
            medianowplayingstation: "vehicle_state/media_info/now_playing_station",
            medianowplayingtitle: "vehicle_state/media_info/now_playing_title",
            mediaplaybacksource: "vehicle_state/media_info/now_playing_source",
            odometer: "vehicle_state/odometer",
            softwareupdatedownloadpercentcomplete: "vehicle_state/software_update/download_perc",
            softwareupdateinstallationpercentcomplete: "vehicle_state/software_update/install_perc",
            softwareupdateversion: "vehicle_state/software_update/version",
            speedlimitmode: "vehicle_state/speed_limit_mode/enabled",
            tpmslastseenpressuretimefl: "vehicle_state/tpms_last_seen_pressure_time_fl",
            tpmslastseenpressuretimefr: "vehicle_state/tpms_last_seen_pressure_time_fr",
            tpmslastseenpressuretimerl: "vehicle_state/tpms_last_seen_pressure_time_rl",
            tpmslastseenpressuretimerr: "vehicle_state/tpms_last_seen_pressure_time_rr",
            tpmspressurefl: "vehicle_state/tpms_pressure_fl",
            tpmspressurefr: "vehicle_state/tpms_pressure_fr",
            tpmspressurefrontleft: "vehicle_state/tpms_pressure_fl",
            tpmspressurefrontright: "vehicle_state/tpms_pressure_fr",
            tpmspressurerl: "vehicle_state/tpms_pressure_rl",
            tpmspressurerearleft: "vehicle_state/tpms_pressure_rl",
            tpmspressurerr: "vehicle_state/tpms_pressure_rr",
            tpmspressurerearright: "vehicle_state/tpms_pressure_rr",
            valetmodeenabled: "vehicle_state/valet_mode_enabled",
            vehiclename: "vehicle_state/vehicle_name",
            version: "vehicle_state/car_version"
        };

        const vehicleConfigMap = {
            wheeltype: "vehicle_config/wheel_type"
        };

        const misc = {
            timestamp: "timestamp"
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
                subfields: false // special handling in websocket loop
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

        async function initialSleepCheck() {
            try {
                const statusUrl = `${baseUrl}/${vin}/status`;
                if (debug) node.log(`Initial sleep check from: ${statusUrl}`);
                const statusRes = await axios.get(statusUrl, {
                    headers: { Authorization: `Bearer ${queryToken}` },
                    timeout: 10000
                });
                const status = statusRes.data?.status;
                isVehicleAsleep = status === "asleep";
                if (debug) node.log(`Vehicle status on startup: ${status}`);

                await doInitialRefresh(); // ✅ Always do one full refresh

                if (isVehicleAsleep) {
                    if (debug) node.log("Vehicle is asleep — starting status polling only");
                    statusPollTimer = setInterval(pollVehicleStatus, 60000);
                } else {
                    if (debug) node.log("Vehicle is awake — starting WebSocket and periodic refresh");
                    connectWebSocket();
                    startPeriodicRefresh();
                }

                updateStatus();
            } catch (err) {
                node.error("Initial sleep check failed: " + err.message);
                updateStatus();
            }
        }

        async function doInitialRefresh() {
            try {
                const url = `${baseUrl}/${vin}/state`;
                if (debug) node.log(`Performing initial full refresh from: ${url}`);
                const res = await axios.get(url, {
                    headers: { Authorization: `Bearer ${queryToken}` },
                    timeout: 10000
                });
                const data = res.data;
                refreshHealthy = true;
                // Optionally publish or cache data here
            } catch (err) {
                refreshHealthy = false;
                node.error("Initial refresh failed: " + err.message);
            }
        }

        function updateStatus() {
            if (!isRunning) {
                node.status({ fill: "gray", shape: "ring", text: "Stopped" });
            } else if (isStarting) {
                node.status({ fill: "yellow", shape: "ring", text: "Starting..." });
            } else if (isVehicleAsleep) {
                let timeString = new Date(lastStreamingMessageTime).toLocaleString();
                node.status({ fill: "blue", shape: "ring", text: `Vehicle asleep. Last message: ${timeString}` });
            } else if (streamingHealthy && refreshHealthy) {
                node.status({ fill: "green", shape: "dot", text: `Connected. Next refresh: ${nextRefreshTime()}` });
            } else {
                const issues = [];
                if (!streamingHealthy && ws) issues.push("streaming");
                if (!refreshHealthy) issues.push("refresh");
                const fillColor = issues.length ? "red" : "yellow";
                const shape = issues.length ? "ring" : "dot";
                const text = issues.length
                    ? `Error: ${issues.join(" & ")} failed. Next refresh: ${nextRefreshTime()}`
                    : `Waiting for data... Next refresh: ${nextRefreshTime()}`;
                node.status({ fill: fillColor, shape, text });
            }
        }

        async function pollVehicleStatus() {
            try {
                const url = `${baseUrl}/${vin}/status`;
                if (debug) node.log(`Polling vehicle status from: ${url}`);
                const res = await axios.get(url, {
                    headers: { Authorization: `Bearer ${queryToken}` },
                    timeout: 10000
                });
                const status = res.data?.status;
                if (debug) node.log(`Vehicle status: ${status}`);

                if (status === "awake" && isVehicleAsleep) {
                    isVehicleAsleep = false;
                    if (statusPollTimer) {
                        clearInterval(statusPollTimer);
                        statusPollTimer = null;
                    }
                    if (debug) node.log("Vehicle woke up — reconnecting WebSocket and starting refresh");
                    connectWebSocket();
                    startPeriodicRefresh();
                } else if (status === "asleep" && !isVehicleAsleep) {
                    isVehicleAsleep = true;
                    if (debug) node.log("Vehicle went to sleep — stopping WebSocket and refresh");
                    if (refreshTimer) {
                        clearInterval(refreshTimer);
                        refreshTimer = null;
                    }
                    if (ws && ws.readyState === WebSocket.OPEN) ws.terminate();
                    statusPollTimer = setInterval(pollVehicleStatus, 60000);
                }

                updateStatus();
            } catch (err) {
                node.error("Error polling vehicle status: " + err.message);
                node.status({ fill: "orange", shape: "ring", text: "Status poll failed" });
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
                if (normalizedKey.includes("temp")) return (val * 9 / 5) + 32;
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
            if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
                if (debug) node.log("WebSocket already open or connecting — skipping new connection.");
                return;
            }

            if (!isRunning) return;
            const url = `${streamBaseURL}/${vin}?access_token=${streamToken}`;
            ws = new WebSocket(url);

            ws.on('open', () => {
                isVehicleAsleep = false;
                streamingHealthy = true;
                lastStreamingMessageTime = Date.now();
                reconnectAttempts = 0;
                reconnectInProgress = false;
                updateStatus();
                if (debug) node.log("WebSocket connected");
                inactivityWatchdogTimer = setInterval(() => {
                    if (!isRunning || !ws || ws.readyState !== WebSocket.OPEN) return;

                    const now = Date.now();
                    if (now - lastStreamingMessageTime > INACTIVITY_TIMEOUT_MS) {
                        if (!reconnectInProgress) {
                            reconnectInProgress = true;
                            if (debug) node.log("Streaming inactivity detected — assuming vehicle is asleep.");
                            isVehicleAsleep = true;
                            ws.terminate(); // force close
                            if (inactivityWatchdogTimer) clearInterval(inactivityWatchdogTimer);
                            statusPollTimer = setInterval(pollVehicleStatus, 60000);
                        }
                    }
                }, 60000); // check every minute

            });

            ws.on('message', (data) => {
                try {
                    const parsed = JSON.parse(data);

                    lastStreamingMessageTime = Date.now();

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

                            if (key === "location" && item.value?.locationValue) { //special handling for location topics
                                const lat = item.value.locationValue.latitude;
                                const lon = item.value.locationValue.longitude;
                                node.send([{ topic: `${topicRoot}/${vehicleName}/drive_state/latitude`, payload: lat }, null]);
                                node.send([{ topic: `${topicRoot}/${vehicleName}/drive_state/longitude`, payload: lon }, null]);
                                node.send([{ topic: `${topicRoot}/${vehicleName}/drive_state/location`, payload: { latitude: lat, longitude: lon } }, null]);
                                return;
                            }

                            if (nestedObjectKeys[key]) {
                                const { prop, baseTopic, subfields } = nestedObjectKeys[key];
                                const nested = item.value?.[prop];
                                if (nested && typeof nested === "object") {
                                    // Publish full object
                                    node.send([{ topic: `${topicRoot}/${vehicleName}/${baseTopic}`, payload: nested }, null]);
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
                                if (mappedPath) {
                                    const msgOut = {
                                        topic: `${topicRoot}/${vehicleName}/${topicPath}`,
                                        payload: convertUnits(topicPath, val)
                                    };
                                    node.send([msgOut, null]);
                                }

                                if (!mappedPath) {
                                    const unmappedTopic = `${topicRoot}/${vehicleName}/unmapped/${key}`;
                                    node.send([{ topic: unmappedTopic, payload: val }, null]);
                                    if (debug) {
                                        node.log(`Unmapped streaming key: ${key} → using fallback topic`);
                                        node.send([null, { payload: `Unmapped streaming key: ${key} → using fallback topic` }]);
                                    }
                                }
                            }
                        });

                        if (Array.isArray(parsed.data) && parsed.data.length > 0) {
                            const lastKey = parsed.data[parsed.data.length - 1].key;
                            const timeStr = new Date().toLocaleString();
                            node.status({
                                fill: "green",
                                shape: "dot",
                                text: `Received ${lastKey} - ${timeStr}`
                            });
                        }

                        if (debug) node.send([null, { payload: parsed }]);
                    } else if (parsed.alerts) {
                        const msgOut = {
                            topic: `${topicRoot}/${vehicleName}/alerts`,
                            payload: JSON.stringify(parsed)
                        };
                        node.send([msgOut, null]);
                    } else if (parsed.connectionId) {
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
                if (inactivityWatchdogTimer) clearInterval(inactivityWatchdogTimer);
                if (manualStop) {
                    node.status({ fill: "gray", shape: "ring", text: "Stopped" });
                    manualStop = false;
                } else {
                    if (!isStarting) updateStatus();
                    if (!reconnectInProgress && !isVehicleAsleep) {
                        if (debug) node.log("WebSocket disconnected. Reconnecting...");
                        safeReconnect("socket close");
                    }
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
            if (isVehicleAsleep) {
                if (debug) node.log("Vehicle is asleep — skipping periodic refresh setup");
                return;
            }
            if (refreshInterval === 0) {
                if (debug) node.log("Periodic refresh disabled (interval set to 0)");
                refreshHealthy = true;
                updateStatus();
                return;
            }
            if (refreshTimer) {
                if (debug) node.log("Refresh timer already running — skipping reinit");
                return;
            }

            let timerInitialized = false;

            async function doRefresh() {
                try {
                    const url = `${baseUrl}/${vin}/state`;
                    if (debug) node.log(`Requesting vehicle state from: ${url}`);
                    const res = await axios.get(url, {
                        headers: { Authorization: `Bearer ${queryToken}` },
                        timeout: 10000
                    });
                    const data = res.data;

                    if (data?.status === "asleep") {
                        if (debug) node.log("Vehicle is asleep — skipping refresh and switching to status polling");

                        if (refreshTimer) {
                            clearInterval(refreshTimer);
                            refreshTimer = null;
                        }

                        if (!isVehicleAsleep) {
                            isVehicleAsleep = true;
                            if (debug) node.log("Vehicle reported asleep via REST — pausing streaming");
                            if (inactivityWatchdogTimer) {
                                clearInterval(inactivityWatchdogTimer);
                                inactivityWatchdogTimer = null;
                            }
                            if (ws && ws.readyState === WebSocket.OPEN) ws.terminate();
                            if (!statusPollTimer) {
                                statusPollTimer = setInterval(pollVehicleStatus, 60000);
                                if (debug) node.log("Started status polling timer");
                            }
                            updateStatus();
                        }

                        return; // skip processing stale data
                    }

                    // Start the timer only after confirming vehicle is awake
                    if (!timerInitialized) {
                        refreshTimer = setInterval(doRefresh, refreshInterval * 1000);
                        timerInitialized = true;
                        if (debug) node.log(`Refresh timer started with interval ${refreshInterval}s`);
                    }

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
                                payload: { latitude: lat, longitude: lon }
                            }, null]);
                        }
                    }

                    refreshHealthy = true;
                    isStarting = false;

                    const timeStr = new Date().toLocaleString();
                    node.status({
                        fill: "green",
                        shape: "dot",
                        text: `Received full refresh - ${timeStr}`
                    });



                } catch (err) {
                    refreshHealthy = false;
                    updateStatus();
                    node.error("Periodic refresh failed: " + (err?.message || err));
                    if (debug) node.log("Full error object: " + JSON.stringify(err, Object.getOwnPropertyNames(err)));
                }
            }

            doRefresh(); //run once immediately
        }


        function startHeartbeat() {
            heartbeatTimer = setInterval(() => {
                if (isRunning) {
                    node.send([{
                        topic: `${topicRoot}/${vehicleName}/heartbeat`,
                        payload: {
                            last_message: lastStreamingMessageTime
                        }
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
                if (inactivityWatchdogTimer) clearInterval(inactivityWatchdogTimer);
                if (refreshTimer) clearInterval(refreshTimer);
                if (heartbeatTimer) clearInterval(heartbeatTimer);
                if (statusPollTimer) {
                    clearInterval(statusPollTimer);
                    statusPollTimer = null;
                    if (debug) node.log("Stopped status polling timer");
                }
                updateStatus();
                if (debug) node.log("Streaming stopped");
            }

            if (command === "start") {
                if (!isRunning) {
                    isRunning = true;
                    isStarting = true;
                    initialSleepCheck();
                    startHeartbeat();
                    updateStatus();
                    if (debug) node.log("Streaming started");
                }
            }
        });

        if (autoStart) {
            isRunning = true;
            isStarting = true;
            initialSleepCheck();
            startHeartbeat();
            updateStatus();
            if (debug) node.log("Auto-start enabled: streaming started");
        }

        node.on('close', () => {
            isRunning = false;
            if (ws) ws.terminate();
            if (inactivityWatchdogTimer) clearInterval(inactivityWatchdogTimer);
            if (refreshTimer) clearInterval(refreshTimer);
            if (heartbeatTimer) clearInterval(heartbeatTimer);
            if (statusPollTimer) {
                clearInterval(statusPollTimer);
                statusPollTimer = null;
            }
        });
    }

    RED.nodes.registerType("tessie-streaming", TessieStreamingNode);
};