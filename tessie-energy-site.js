module.exports = function(RED) {
    function TessieEnergySiteNode(n) {
        RED.nodes.createNode(this,n);
        this.name = n.name;
        this.siteId = n.siteId;
    }
    RED.nodes.registerType("tessie-energy-site",TessieEnergySiteNode);
}
