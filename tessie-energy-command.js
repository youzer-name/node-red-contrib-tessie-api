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
            this.site = RED.nodes.getNode(config.site);
            if (this.server && this.site.siteId) {
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

                        msg.payload = data;

                        msg.api_call = {
                            method: options.method,
                            url: options.url,
                            body: options.body,
                            headers: options.headers,
                        }
                        
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
                
                var fullurl = this.server.baseUrl + "/api/1/energy_sites/" + this.site.siteId + "/" + config.command;
                var body = {};
                var options = {
                        method: "POST",
                        url: fullurl,
                        headers: { Authorization: 'Bearer ' + this.server.token, "Content-Type": "application/json" },
                        body: {},
                        json: true
                    }; 
                if (config.command === "backup") {
                    options.body.backup_reserve_percent = Number(cfg.percent);
                } else if (config.command === "grid_import_export") {
                    options.body.customer_preferred_export_rule = cfg.customer_preferred_export_rule;
                    options.body.disallow_charge_from_grid_with_solar_installed = cfg.disallow_charge_from_grid_with_solar_installed;
                } else if (config.command === "off_grid_vehicle_charging_reserve") {
                    options.body.off_grid_vehicle_charging_reserve_percent = cfg.percent;
                } else if (config.command === "operation") {
                    options.body.default_real_mode = cfg.default_real_mode;
                } else if (config.command === "storm_mode") {
                    options.body.enabled = cfg.enabled;
                }
                await sendApiCall(options);

            } else {
                msg.server = "No config node configured or site missing";
                node.send(msg);
            }
        });
    }
    RED.nodes.registerType("tessie-energy-command", TessieCommand);
}
