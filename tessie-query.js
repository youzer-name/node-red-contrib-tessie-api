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
            this.server = RED.nodes.getNode(cfg.server);
            this.vehicle = RED.nodes.getNode(cfg.vehicle);
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

        // Check if the response is a PNG image (for map)
        const contentType = response.headers.get("Content-Type");
        
        if (config.queryType === "map") {
            if (contentType && contentType.includes("image/png")) {
                // If the response is a PNG, treat it as binary
                const arrayBuffer = await response.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);  // Convert arrayBuffer to Node.js Buffer
                msg.response = buffer;
            } else {
                msg.response = await response.text();
                node.warn(`Non-PNG response received for 'map' query type: ${msg.response}`);
            }
        } else {
            const data = await response.json();
            msg.payload = data;
        }

        msg.api_call = {
            method: options.method,
            url: options.url,
            headers: options.headers
        };

    } catch (error) {
        msg.response = `Fetch error: ${error.name} - ${error.message}`;
        node.error(`API call failed: ${error.message}`, msg);
        node.status({ fill: "red", shape: "ring", text: "error: " + error.message });
    } finally {
        clearTimeout(timeout);
        node.send(msg);
        node.status({});
    }
};

                
                // Handle all query types from the HTML dropdown
                if (config.queryType === "location" || config.queryType === "plate" || config.queryType === "status" || config.queryType === "battery" || 
                    config.queryType === "firmware_alerts" || config.queryType === "consumption_since_charge" || config.queryType === "weather" ||
                    config.queryType === "last_idle_state" || config.queryType === "drivers" || config.queryType === "invitations") { // no params
                    var fullurl = this.server.baseUrl + "/" + this.vehicle.vin + "/" + config.queryType;
                    var options = { method: "GET", url: fullurl, headers: { Authorization: 'Bearer ' + this.server.token } };
                    await sendApiCall(options);
                } else if (config.queryType === "state") {  // only use_cache
                    var params = [];
                    if (cfg.use_cache !== undefined) params.push("use_cache=" + cfg.use_cache);
                    var fullurl = this.server.baseUrl + "/" + this.vehicle.vin + "/state" + (params.length ? ("?" + params.join("&")) : "");
                    var options = { method: "GET", url: fullurl, headers: { Authorization: 'Bearer ' + this.server.token } };
                    await sendApiCall(options);
                } else if (config.queryType === "vehicles") { // only use only_active
                    var params = [];
                    if (cfg.only_active !== undefined) params.push("only_active=" + cfg.only_active);
                    var fullurl = this.server.baseUrl + "/vehicles" + (params.length ? ("?" + params.join("&")) : "");
                    var options = { method: "GET", url: fullurl, headers: { Authorization: 'Bearer ' + this.server.token } };
                    await sendApiCall(options);
                } else if (config.queryType === "states") {
                    var params = [];
                    if (cfg.interval) params.push("interval=" + cfg.interval);
                    if (cfg.condense) params.push("condense=" + cfg.condense);
                    if (cfg.timezone) params.push("timezone=" + cfg.timezone);
                    if (cfg.distance_format) params.push("distance_format=" + cfg.distance_format);
                    if (cfg.temperature_format) params.push("temperature_format=" + cfg.temperature_format);
                    if (cfg.format) params.push("format=" + cfg.format);
                    if (fromTime) params.push("from=" + fromTime);
                    if (toTime) params.push("to=" + toTime);
                    var fullurl = this.server.baseUrl + "/" + this.vehicle.vin + "/states" + (params.length ? ("?" + params.join("&")) : "");
                    var options = { method: "GET", url: fullurl, headers: { Authorization: 'Bearer ' + this.server.token } };
                    await sendApiCall(options);
                } else if (config.queryType === "battery_health") {
                    var params = [];
                    if (fromTime) params.push("from=" + fromTime);
                    if (toTime) params.push("to=" + toTime);
                    if (cfg.distance_format) params.push("distance_format=" + cfg.distance_format);
                    if (cfg.only_active) params.push("only_active=" + cfg.only_active);
                    var fullurl = this.server.baseUrl + "/battery_health" + (params.length ? ("?" + params.join("&")) : "");
                    var options = { method: "GET", url: fullurl, headers: { Authorization: 'Bearer ' + this.server.token } };
                    await sendApiCall(options);
                } else if (config.queryType === "battery_health_measurements") {
                    var params = [];
                    if (fromTime) params.push("from=" + fromTime);
                    if (toTime) params.push("to=" + toTime);
                    if (cfg.distance_format) params.push("distance_format=" + cfg.distance_format);
                    var fullurl = this.server.baseUrl + "/" + this.vehicle.vin + "/battery_health" + (params.length ? ("?" + params.join("&")) : "");
                    var options = { method: "GET", url: fullurl, headers: { Authorization: 'Bearer ' + this.server.token } };
                    await sendApiCall(options);
                } else if (config.queryType === "map") {
                    var params = [];
                    if (cfg.width !== undefined && cfg.width !== null && cfg.width !== "") params.push("width=" + cfg.width);
                    if (cfg.height !== undefined && cfg.height !== null && cfg.height !== "") params.push("height=" + cfg.height);
                    if (cfg.zoom !== undefined && cfg.zoom !== null && cfg.zoom !== "") params.push("zoom=" + cfg.zoom);
                    if (cfg.marker_size !== undefined && cfg.marker_size !== null && cfg.marker_size !== "") params.push("marker_size=" + cfg.marker_size);
                    if (cfg.style !== undefined && cfg.style !== null && cfg.style !== "") params.push("style=" + cfg.style);
                    var fullurl = this.server.baseUrl + "/" + this.vehicle.vin + "/map" + (params.length ? ("?" + params.join("&")) : "");
                    var options = { method: "GET", url: fullurl, headers: { Authorization: 'Bearer ' + this.server.token } };
                    await sendApiCall(options);
                } else if (config.queryType === "drives") {
                    var params = [];
                    if (cfg.distance_format) params.push("distance_format=" + cfg.distance_format);
                    if (cfg.temperature_format) params.push("temperature_format=" + cfg.temperature_format);
                    if (fromTime) params.push("from=" + fromTime);
                    if (toTime) params.push("to=" + toTime);
                    if (cfg.timezone) params.push("timezone=" + cfg.timezone);
                    if (cfg.origin_latitude) params.push("origin_latitude=" + cfg.origin_latitude);
                    if (cfg.origin_longitude) params.push("origin_longitude=" + cfg.origin_longitude);
                    if (cfg.origin_radius) params.push("origin_radius=" + cfg.origin_radius);
                    if (cfg.exclude_origin) params.push("exclude_origin=" + cfg.exclude_origin);
                    if (cfg.destination_latitude) params.push("destination_latitude=" + cfg.destination_latitude);
                    if (cfg.destination_longitude) params.push("destination_longitude=" + cfg.destination_longitude);
                    if (cfg.destination_radius) params.push("destination_radius=" + cfg.destination_radius);
                    if (cfg.exclude_destination) params.push("exclude_destination=" + cfg.exclude_destination);
                    if (cfg.tag) params.push("tag=" + cfg.tag);
                    if (cfg.exclude_tag) params.push("exclude_tag=" + cfg.exclude_tag);
                    if (cfg.driver_profile) params.push("driver_profile=" + cfg.driver_profile);
                    if (cfg.exclude_driver_profile) params.push("exclude_driver_profile=" + cfg.exclude_driver_profile);
                    if (cfg.format) params.push("format=" + cfg.format);
                    if (cfg.minimum_distance) params.push("minimum_distance=" + cfg.minimum_distance);
                    if (cfg.limit) params.push("limit=" + cfg.limit);
                    var fullurl = this.server.baseUrl + "/" + this.vehicle.vin + "/drives" + (params.length ? ("?" + params.join("&")) : "");
                    var options = { method: "GET", url: fullurl, headers: { Authorization: 'Bearer ' + this.server.token } };
                    await sendApiCall(options);
                } else if (config.queryType === "path") {
                    var params = [];
                    if (fromTime) params.push("from=" + fromTime);
                    if (toTime) params.push("to=" + toTime);
                    if (cfg.separate) params.push("separate=" + cfg.separate);
                    if (cfg.simplify) params.push("simplify=" + cfg.simplify);
                    if (cfg.details) params.push("details=" + cfg.details);
                    var fullurl = this.server.baseUrl + "/" + this.vehicle.vin + "/path" + (params.length ? ("?" + params.join("&")) : "");
                    var options = { method: "GET", url: fullurl, headers: { Authorization: 'Bearer ' + this.server.token } };
                    await sendApiCall(options);
                } else if (config.queryType === "charges") {
                    var params = [];
                    if (cfg.distance_format) params.push("distance_format=" + cfg.distance_format);
                    if (cfg.format) params.push("format=" + cfg.format);
                    if (cfg.superchargers_only !== undefined && cfg.superchargers_only !== "") params.push("superchargers_only=" + cfg.superchargers_only);
                    if (cfg.origin_latitude) params.push("origin_latitude=" + cfg.origin_latitude);
                    if (cfg.origin_longitude) params.push("origin_longitude=" + cfg.origin_longitude);
                    if (cfg.origin_radius) params.push("origin_radius=" + cfg.origin_radius);
                    if (cfg.exclude_origin) params.push("exclude_origin=" + cfg.exclude_origin);
                    if (cfg.timezone) params.push("timezone=" + cfg.timezone);
                    if (fromTime) params.push("from=" + fromTime);
                    if (toTime) params.push("to=" + toTime);
                    if (cfg.minimum_energy_added) params.push("minimum_energy_added=" + cfg.minimum_energy_added);
                    if (cfg.limit) params.push("limit=" + cfg.limit);
                    var fullurl = this.server.baseUrl + "/" + this.vehicle.vin + "/charges" + (params.length ? ("?" + params.join("&")) : "");
                    var options = { method: "GET", url: fullurl, headers: { Authorization: 'Bearer ' + this.server.token } };
                    await sendApiCall(options);
                } else if (config.queryType === "charging_invoices") {
                    var params = [];
                    if (cfg.timezone) params.push("timezone=" + cfg.timezone);
                    if (fromTime) params.push("from=" + fromTime);
                    if (toTime) params.push("to=" + toTime);
                    if (cfg.format) params.push("format=" + cfg.format);
                    var fullurl = this.server.baseUrl + "/charging_invoices" + (params.length ? ("?" + params.join("&")) : "");
                    var options = { method: "GET", url: fullurl, headers: { Authorization: 'Bearer ' + this.server.token } };
                    await sendApiCall(options);
                } else if (config.queryType === "idles") {
                    var params = [];
                    if (cfg.distance_format) params.push("distance_format=" + cfg.distance_format);
                    if (cfg.format) params.push("format=" + cfg.format);
                    if (cfg.timezone) params.push("timezone=" + cfg.timezone);
                    if (fromTime) params.push("from=" + fromTime);
                    if (toTime) params.push("to=" + toTime);
                    if (cfg.origin_latitude) params.push("origin_latitude=" + cfg.origin_latitude);
                    if (cfg.origin_longitude) params.push("origin_longitude=" + cfg.origin_longitude);
                    if (cfg.origin_radius) params.push("origin_radius=" + cfg.origin_radius);
                    if (cfg.exclude_origin) params.push("exclude_origin=" + cfg.exclude_origin);
                    if (cfg.limit) params.push("limit=" + cfg.limit);
                    var fullurl = this.server.baseUrl + "/" + this.vehicle.vin + "/idles" + (params.length ? ("?" + params.join("&")) : "");
                    var options = { method: "GET", url: fullurl, headers: { Authorization: 'Bearer ' + this.server.token } };
                    await sendApiCall(options);
                } else if (config.queryType === "tire_pressure") {
                    var params = [];
                    if (cfg.pressure_format) params.push("pressure_format=" + cfg.pressure_format);
                    if (fromTime) params.push("from=" + fromTime);
                    if (toTime) params.push("to=" + toTime);
                    var fullurl = this.server.baseUrl + "/" + this.vehicle.vin + "/tire_pressure" + (params.length ? ("?" + params.join("&")) : "");
                    var options = { method: "GET", url: fullurl, headers: { Authorization: 'Bearer ' + this.server.token } };
                    await sendApiCall(options);
                } else {
                    msg.payload = "Unknown query type";
                    node.status({ fill: "yellow", shape: "ring", text: "Unknown query type" });
                    node.send(msg);

                }
            }
        });
    }
    RED.nodes.registerType("tessie-query", TessieQuery);
}
