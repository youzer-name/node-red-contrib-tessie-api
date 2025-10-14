module.exports = function(RED) {
    function TessieQuery(config) {
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
            let fromTime, toTime;
            if (cfg.fromType === "date") {
                let date = cfg.from_date || "";
                let time = cfg.from_time || "";
                if (date && time) {
                    let dt = new Date(date + "T" + time);
                    fromTime = Math.floor(dt.getTime() / 1000);
                } else {
                    fromTime = "";
                }
            } else {
                fromTime = RED.util.evaluateNodeProperty(cfg.from, cfg.fromType, node, msg);
            }
            if (cfg.toType === "date") {
                let date = cfg.to_date || "";
                let time = cfg.to_time || "";
                if (date && time) {
                    let dt = new Date(date + "T" + time);
                    toTime = Math.floor(dt.getTime() / 1000);
                } else {
                    toTime = "";
                }
            } else {
                toTime = RED.util.evaluateNodeProperty(cfg.to, cfg.toType, node, msg);
            }
            if (this.server && this.site) {
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
                            headers: options.headers
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
                var fullurl = this.server.baseUrl + "/api/1/";
                var site_url = "energy_sites/" + this.site.siteId + "/";
                var options;
                // Handle all query types from the HTML dropdown
                if (config.queryType === "products") { // no params                    
                    fullurl += config.queryType;
                    options = { method: "GET", url: fullurl, headers: { Authorization: 'Bearer ' + this.server.token } };
                    await sendApiCall(options);
                } else if (config.queryType === "site_info") {
                    fullurl += site_url + config.queryType;
                    options = { method: "GET", url: fullurl, headers: { Authorization: 'Bearer ' + this.server.token } };
                    await sendApiCall(options);
                } else if (config.queryType === "backup_history") {  
                    var params = [];
                    params.push("kind=backup");
                    if (config.start_date) params.push("start_date=" + config.start_date);
                    if (config.end_date) params.push("end_date=" + config.end_date);
                    if (config.period) params.push("period=" + config.period);
                    params.push("time_zone=UTC");
                    fullurl += site_url + config.queryType + (params.length ? ("?" + params.join("&")) : "");
                    options = { method: "GET", url: fullurl, headers: { Authorization: 'Bearer ' + this.server.token } };
                    await sendApiCall(options);
                } else if (config.queryType === "charge_history") {  
                    var params = [];
                    params.push("kind=charge");
                    if (config.start_date) params.push("start_date=" + config.start_date);
                    if (config.end_date) params.push("end_date=" + config.end_date);
                    if (config.period) params.push("period=" + config.period);
                    params.push("time_zone=UTC");
                    fullurl += site_url + config.queryType + (params.length ? ("?" + params.join("&")) : "");
                    options = { method: "GET", url: fullurl, headers: { Authorization: 'Bearer ' + this.server.token } };
                    await sendApiCall(options);
                } else if (config.queryType === "energy_history") {  
                    var params = [];
                    params.push("kind=energy");
                    if (config.start_date) params.push("start_date=" + config.start_date);
                    if (config.end_date) params.push("end_date=" + config.end_date);
                    if (config.period) params.push("period=" + config.period);
                    params.push("time_zone=UTC");
                    fullurl += site_url + config.queryType + (params.length ? ("?" + params.join("&")) : "");
                    var options = { method: "GET", url: fullurl, headers: { Authorization: 'Bearer ' + this.server.token } };
                    await sendApiCall(options);
                } else if (config.queryType === "live_status") { // only use only_active
                    var params = [];
                    fullurl += site_url + config.queryType;
                    options = { method: "GET", url: fullurl, headers: { Authorization: 'Bearer ' + this.server.token } };
                    await sendApiCall(options);
                } else {
                    msg.payload = "Unknown query type";
                    node.send(msg);
                }
            }
        });
    }
    RED.nodes.registerType("tessie-energy-query", TessieQuery);
}
