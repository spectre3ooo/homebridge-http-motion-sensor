var Service;
var Characteristic;
var HomebridgeAPI;
var http = require('http');
var url = require('url');

module.exports = function(homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    HomebridgeAPI = homebridge;

    homebridge.registerAccessory("homebridge-http-motion-sensor", "http-motion-sensor", HTTPMotionSensor);
};


function HTTPMotionSensor(log, config) {
    this.log = log;
    this.name = config.name;
    this.port = config.port;
    this.reportBatteryLevel = config.reportBatteryLevel;
    this.lowBatteryLevel = config.lowBatteryLevel;
    this.fullBatteryLevel = config.fullBatteryLevel;
    this.currentBatteryLevel = null;
    this.currentBatteryPercent = null;
    this.motionDetected = false;
    this.timeout = null;

    this.repeater = config.repeater || [];

    var that = this;
    this.server = http.createServer(function(request, response) {
        var vdd = null;
        //that.log(`url: ${request.url}`);
        //that.log(`reportBatteryLevel: ${that.reportBatteryLevel}`);
        if(that.reportBatteryLevel){
            var queryData = url.parse(request.url, true).query;
            if(queryData.vdd){
                //that.log(`query vdd: ${queryData.vdd}`);
                vdd = parseInt(queryData.vdd);
                //that.log(`parsed vdd: ${queryData.vdd}`);
            }
        }
        that.httpHandler(that, vdd);
        response.end('Successfully requested: ' + request.url);
    });

    // battery service
    if(this.reportBatteryLevel) {
        this.batteryService = new Service.BatteryService(this.name);
        // BatteryService
        this.batteryService.getCharacteristic(Characteristic.BatteryLevel)
            .on('get', this.getBatteryLevel.bind(this));
        this.batteryService.getCharacteristic(Characteristic.ChargingState)
            .on('get', this.getChargingState.bind(this));
        this.batteryService.getCharacteristic(Characteristic.StatusLowBattery)
            .on('get', this.getStatusLowBattery.bind(this));
        this.batteryMultiplier = 100.0 / (this.fullBatteryLevel - this.lowBatteryLevel);

    }

    // info service
    this.informationService = new Service.AccessoryInformation();
        
    this.informationService
        .setCharacteristic(Characteristic.Manufacturer, "PIR Manufacturer")
        .setCharacteristic(Characteristic.Model, config.model || "HC-SR501")
        .setCharacteristic(Characteristic.SerialNumber, config.serial || "4BD53931-D4A9-4850-8E7D-8A51A842FA29");


    

    this.service = new Service.MotionSensor(this.name);

    this.service.getCharacteristic(Characteristic.MotionDetected)
        .on('get', this.getState.bind(this));

    this.server.listen(this.port, function(){
        that.log("Motion sensor server listening on: http://<your ip goes here>:%s", that.port);
    });
}

HTTPMotionSensor.prototype.getBatteryLevel = function(callback) {
    this.log(`Getting battery level: ${this.currentBatteryPercent}`);
    callback(null, this.currentBatteryPercent);
};

HTTPMotionSensor.prototype.getChargingState = function(callback) {
    callback(null, Characteristic.ChargingState.NOT_CHARGEABLE);
};

HTTPMotionSensor.prototype.getStatusLowBattery = function(callback) {
    this.log(`Getting battery status`);
    callback(null, this.currentBatteryPercent < 20
        ? Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
        : Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL
    );
};
HTTPMotionSensor.prototype.getState = function(callback) {
    callback(null, this.motionDetected);
};

HTTPMotionSensor.prototype.httpHandler = function(that, vdd) {
    that.log("motion detected");
    if(vdd) {
        that.currentBatteryLevel = vdd;
        if(that.currentBatteryLevel >= that.fullBatteryLevel) that.currentBatteryPercent = 100;
        else if(that.currentBatteryLevel <= that.lowBatteryLevel) that.currentBatteryPercent = 0;
        else that.currentBatteryPercent = this.batteryMultiplier * (this.currentBatteryLevel - this.lowBatteryLevel)
        that.log("battery level: " + that.currentBatteryLevel);
        that.log("battery percent: " + that.currentBatteryPercent);
        that.batteryService.getCharacteristic(Characteristic.BatteryLevel)
            .updateValue(that.currentBatteryPercent, null, "httpHandler");
        that.batteryService.getCharacteristic(Characteristic.StatusLowBattery)
            .updateValue(that.currentBatteryPercent < 20
                            ? Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
                            : Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL, null, "httpHandler");
    }
    for (var i = 0; i < that.repeater.length; i++) {
        // that.log("reflecting to " + that.repeater[i]);
        http.get(that.repeater[i], function(res) {
            // one could do something with this information
        });
    }

    that.motionDetected = true;
    that.service.getCharacteristic(Characteristic.MotionDetected)
        .updateValue(that.motionDetected, null, "httpHandler");
    if (that.timeout) clearTimeout(that.timeout);
    that.timeout = setTimeout(function() {
        that.motionDetected = false;
        that.service.getCharacteristic(Characteristic.MotionDetected)
            .updateValue(that.motionDetected, null, "httpHandler");
        that.timeout = null;
    }, 11 * 1000);
};

HTTPMotionSensor.prototype.getServices = function() {
    if(this.reportBatteryLevel){
        return [this.informationService, this.service, this.batteryService];
    }else {
        return [this.informationService, this.service];
    }
};
