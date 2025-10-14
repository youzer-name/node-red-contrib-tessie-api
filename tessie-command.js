module.exports = function(RED) {

    function TessieCommand(config) {
        RED.nodes.createNode(this,config);
        var node = this;
        node.on('input', async function(msg) {

            // Allow config properties to be overridden by inbound msg properties
            let cfg = Object.assign({}, config);
            for (const key in msg) {
                if (msg.hasOwnProperty(key)) {
                    cfg[key] = msg[key];
                }
            }

            this.server = RED.nodes.getNode(config.server);
            this.vehicle = RED.nodes.getNode(config.vehicle);
            if (this.server && this.vehicle) {
                node.status({ fill: "blue", shape: "dot", text: "calling API..." });

                const sendApiCall = async function(options) {
                        const controller = new AbortController();
                        const timeout = setTimeout(() => controller.abort(), 30000); // 30 sec timeout
                        try {
                            const response = await fetch(options.url, {
                                method: options.method,
                                headers: options.headers,
                                body: options.body ? JSON.stringify(options.body) : undefined,
                                signal: controller.signal
                            });
                            clearTimeout(timeout);
                            const data = await response.json();
                            msg.api_call = {
                                method: options.method,
                                url: options.url,
                                body: options.body,
                                headers: options.headers
                            }
                            msg.response = data;
                        } catch (error) {
                            msg.response = `Fetch error: ${error.name} - ${error.message}`;
                            msg.api_call = {
                                method: options.method,
                                url: options.url,
                                headers: options.headers}
                            node.status({ fill: "red", shape: "ring", text: "error: " + error.message });
                            node.error(`API call failed: ${error.message}`, msg);
                            } finally {
                              clearTimeout(timeout);
                              node.send(msg);
                              node.status({});
                        }
                                            
                    };


                    var fullurl = this.server.baseUrl + '/' + this.vehicle.vin + "/";
                    var body = {};
                    var options  = {
                        method: "POST",
                           url: undefined,
                           headers: { Authorization: 'Bearer ' + this.server.token, "Content-Type": "application/json" },
                           body: {},
                           json: true
                        };
                    var params = [];
                    if (config.command === "set_tag") {
                        fullurl += "drives/";
                        options.body.drives = cfg.drives;
                        options.body.tag = cfg.tag;
                    } else if (config.command === "set_cost") {
                        fullurl += `charges/${cfg.charge_id}/`;
                        options.body.cost = cfg.cost;
                    } else if (config.command === "plate") {
                        options.body.plate = cfg.plate;
                    } else if (config.command === "wake" || config.command === "invitations") {
                        options.body = undefined
                    } else if (config.command === "set_temperatures") {
                        fullurl += "command/";
                        params.push(`temperature=${cfg.temperature}`);
                        params.push(`wait_for_completion=${cfg.wait_for_completion}`);
                    } else if (config.command === "set_seat_heat" || config.command === "set_seat_cool") {
                        fullurl += "command/";
                        params.push(`seat=${cfg.seat}`);
                        params.push(`level=${cfg.level}`);
                        params.push(`wait_for_completion=${cfg.wait_for_completion}`);
                    } else if (config.command === "set_cabin_overheat_protection") {
                        fullurl += "command/";
                        params.push(`on=${cfg.on}`);
                        params.push(`fan_only=${cfg.fan_only}`);
                        params.push(`wait_for_completion=${cfg.wait_for_completion}`);
                    } else if (config.command === "set_cop_temp") {
                        fullurl += "command/";
                        params.push(`cop_temp=${cfg.cop_temp}`);
                        params.push(`wait_for_completion=${cfg.wait_for_completion}`);
                    } else if (config.command === "set_bioweapon_mode") {
                        fullurl += "command/";
                        params.push(`on=${cfg.on}`);
                        params.push(`wait_for_completion=${cfg.wait_for_completion}`);
                    } else if (config.command === "set_climate_keeper_mode") {
                        fullurl += "command/";
                        params.push(`mode=${cfg.mode}`);
                        params.push(`wait_for_completion=${cfg.wait_for_completion}`);
                    } else if (config.command === "lock" || config.command === "unlock"
                        || config.command === "activate_front_trunk" || config.command === "activate_rear_trunk"
                        || config.command === "open_tonneau" || config.command === "close_tonneau"
                        || config.command === "vent_windows" || config.command === "close_windows"
                        || config.command === "start_climate" || config.command === "stop_climate"
                        || config.command === "start_max_defrost" || config.command === "stop_max_defrost"
                        || config.command === "start_steering_wheel_heater" || config.command === "stop_steering_wheel_heater"
                        || config.command === "start_charging" || config.command === "stop_charging"
                        || config.command === "open_charge_port" || config.command === "close_charge_port"
                        || config.command === "flash" || config.command === "honk"
                        || config.command === "trigger_homelink" || config.command === "remote_start"
                        || config.command === "vent_sunroof" || config.command === "close_sunroof"
                        || config.command === "enable_sentry" || config.command === "disable_sentry"
                        || config.command === "enable_valet" || config.command === "disable_valet"
                        || config.command === "cancel_software_update" || config.command === "remote_boombox"
                        || config.command === "enable_guest" || config.command === "disable_guest" ) {
                        options.body = undefined;
                        fullurl += "command/";
                        params.push(`wait_for_completion=${cfg.wait_for_completion}`);
                    } else if (config.command === "set_charge_limit") {
                        options.body = undefined;
                        fullurl += "command/";
                        params.push(`percent=${cfg.percent}`);
                        params.push(`wait_for_completion=${cfg.wait_for_completion}`);
                    } else if (config.command === "set_charging_amps") {
                        fullurl += "command/";
                        params.push(`amps=${cfg.amps}`);
                        params.push(`wait_for_completion=${cfg.wait_for_completion}`);
                    } else if (config.command === "schedule_software_update") {
                        fullurl += "command/";
                        params.push(`in_seconds=${cfg.in_seconds}`);
                        params.push(`wait_for_completion=${cfg.wait_for_completion}`);
                    } else if (config.command === "add_charge_schedule") {
                        fullurl += "command/";
                        params.push(`days_of_week=${cfg.days_of_week}`);
                        params.push(`enabled=${cfg.enabled}`);
                        params.push(`start_enabled=${cfg.start_enabled}`);
                        params.push(`end_enabled=${cfg.end_enabled}`);
                        params.push(`one_time=${cfg.one_time}`);
                        if(cfg.id) params.push(`id=${cfg.id}`);
                        params.push(`start_time=${cfg.start_time}`);
                        params.push(`end_time=${cfg.end_time}`);
                        params.push(`lat=${cfg.lat}`);
                        params.push(`lon=${cfg.lon}`);
                        params.push(`wait_for_completion=${cfg.wait_for_completion}`);
                    } else if (config.command === "remove_charge_schedule") {
                        fullurl += "command/";
                        params.push(`id=${cfg.id}`);
                        params.push(`wait_for_completion=${cfg.wait_for_completion}`);
                    } else if (config.command === "add_precondition_schedule") {
                        fullurl += "command/";
                        params.push(`days_of_week=${cfg.days_of_week}`);
                        params.push(`enabled=${cfg.enabled}`);
                        params.push(`one_time=${cfg.one_time}`);
                        if(cfg.id) params.push(`id=${cfg.id}`);
                        params.push(`precondition_time=${cfg.precondition_time}`);
                        params.push(`lat=${cfg.lat}`);
                        params.push(`lon=${cfg.lon}`);
                        params.push(`wait_for_completion=${cfg.wait_for_completion}`);
                    } else if (config.command === "remove_precondition_schedule") {
                        fullurl += "command/";
                        params.push(`id=${cfg.id}`);
                        params.push(`wait_for_completion=${cfg.wait_for_completion}`);
                    } else if (config.command === "share") {
                        fullurl += "command/";
                        params.push(`value=${cfg.value}`);
                        params.push(`locale=${cfg.locale}`);
                        params.push(`wait_for_completion=${cfg.wait_for_completion}`);
                    } else if (config.command === "set_speed_limit") {
                        fullurl += "command/";
                        params.push(`mph=${cfg.mph}`);
                        params.push(`wait_for_completion=${cfg.wait_for_completion}`);
                    } else if (config.command === "enable_speed_limit" || config.command === "disable_speed_limit"
                        || config.command === "clear_speed_limit_pin") {
                        fullurl += "command/";
                        params.push(`pin=${cfg.pin}`);
                        params.push(`wait_for_completion=${cfg.wait_for_completion}`);
                    } else if (config.command === "delete") {
                        fullurl += `drivers/${cfg.id}/`;
                        options.body.id = parseInt(cfg.user_id);
                        params.push(`wait_for_completion=${cfg.wait_for_completion}`);
                    } else if (config.command === "revoke") {
                        fullurl += `invitations/${cfg.user_id}/`;
                    }    
                    
                    fullurl += config.command;
                    fullurl += (params.length ? ("?" + params.join("&")) : "");
                    options.url = fullurl;
                    
                    msg.fullurl = fullurl;
                    msg.headers = options.headers;
                    msg.body = options.body;
                    await sendApiCall(options)
                } else {
                    msg.server = "No config node configured or vehicle missing";
                    node.send(msg);
            }
        });
    }
    RED.nodes.registerType("tessie-command", TessieCommand);
}
