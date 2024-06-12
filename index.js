const request = require("requestretry");

let hap;

module.exports = function(api) {
  hap = api.hap;
	api.registerAccessory("homebridge-aristonaquawh", "AristonAquaWH", AristonWaterHeater);
}

class AristonWaterHeater {
  constructor(log, config, api) {
    try {
      this.log = log;

      this.name = config["name"];
      this.username = config["username"] || "";
      this.password = config["password"] || "";
      this.plantID = config["plantID"] || "";
      this.model = config["model"] || "VELIS Tech Dry";
      this.serial_number = config["serial_number"] || "123456789";

      this.interval = 600;
      this.temperature = 0;

      this.informationService = new hap.Service.AccessoryInformation();
      this.informationService
        .setCharacteristic(hap.Characteristic.Name, this.name)
        .setCharacteristic(hap.Characteristic.Manufacturer, "Ariston")
        .setCharacteristic(hap.Characteristic.Model, this.model)
        .setCharacteristic(hap.Characteristic.SerialNumber, this.serial_number);

      this.thermostatService = new hap.Service.Thermostat(this.name);
      this.thermostatService
        .getCharacteristic(hap.Characteristic.CurrentTemperature)
        .onGet(this.getCurrentTemperature.bind(this));

      this.updateDeviceData();

      setInterval(this.updateDeviceData.bind(this), this.interval * 1000);
    }
    catch (error) {
        this.log("Error module " + error);
    }
  }

  getServices() {
    return [this.informationService, this.thermostatService];
  }

  getCurrentTemperature() {
      return this.temperature;
  }

  updateDeviceData() {
    try {
      this.log("Updating temperature");

      getTemperatureAPI(this);
    }
    catch (error) {
      this.log("Error updating temperature " + error);
    }
  }
}

function getTemperatureAPI(that) {
  try {
    request.post({
      url: "https://www.ariston-net.remotethermo.com/R2/Account/Login",
      form: {
        Email: that.username,
        Password: that.password,
        RememberMe: false
      },
      jar: true,
      json: true,
      maxAttempts: 3,
      retryDelay: 6000,
      retryStrategy: request.RetryStrategies.HTTPOrNetworkError,
      rejectUnauthorized: false
    }, function(err, resp, body) {
      if (err || resp.statusCode === 200) {
        request({
          url: "https://www.ariston-net.remotethermo.com/api/v2/velis/plantData/" + that.plantID,
          jar: true,
          json: true,
          maxAttempts: 3,
          retryDelay: 6000,
          retryStrategy: request.RetryStrategies.HTTPOrNetworkError,
          rejectUnauthorized: false
        }, function(err, resp, body) {      
          if (err || resp.statusCode === 200) {
            that.temperature = body.temp;
            that.log("Success updating temperature " + that.temperature);
          }
          else
          {
            throw new Error(err);
          }
        });
      }
      else{
        throw new Error(err);
      }
    });
  }
  catch (error) {
    throw new Error(error);
  }
}
