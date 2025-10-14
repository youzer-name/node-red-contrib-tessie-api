module.exports = function(RED) {
    function RemoteServerNode(n) {
        RED.nodes.createNode(this,n);
    this.baseUrl = n.baseUrl;
    this.token = n.token;
    this.tessieservername = n.tessieservername;
    }
    RED.nodes.registerType("tessie-server",RemoteServerNode);
}
