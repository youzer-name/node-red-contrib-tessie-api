module.exports = function(RED) {
    function TessieVehicleNode(n) {
        RED.nodes.createNode(this,n);
        this.name = n.name;
        this.vin = n.vin;
    }
    RED.nodes.registerType("tessie-vehicle",TessieVehicleNode);
}
