const request = require("requestretry");

let hap;

module.exports = function(api) {
  hap = api.hap;
  api.registerAccessory(
    "homebridge-aristonaquawh",
    "AristonAquaWH",
    AristonWaterHeater
  );
};

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
      this.targetTemperature = 80;
      this.heaterOn = true;

      this.informationService = new hap.Service.AccessoryInformation();

      this.informationService
        .setCharacteristic(
          hap.Characteristic.Name,
          this.name
        )
        .setCharacteristic(
          hap.Characteristic.Manufacturer,
          "Ariston"
        )
        .setCharacteristic(
          hap.Characteristic.Model,
          this.model
        )
        .setCharacteristic(
          hap.Characteristic.SerialNumber,
          this.serial_number
        );

      this.thermostatService =
        new hap.Service.Thermostat(this.name);

      this.thermostatService
        .getCharacteristic(
          hap.Characteristic.CurrentTemperature
        )
        .onGet(
          this.getCurrentTemperature.bind(this)
        );

      this.thermostatService
        .getCharacteristic(
          hap.Characteristic.TargetTemperature
        )
        .onGet(
          this.getTargetTemperature.bind(this)
        )
        .onSet(
          this.setTargetTemperature.bind(this)
        );

      this.thermostatService
        .getCharacteristic(
          hap.Characteristic.CurrentHeatingCoolingState
        )
        .onGet(
          this.getCurrentHeatingState.bind(this)
        );

      this.thermostatService
        .getCharacteristic(
          hap.Characteristic.TargetHeatingCoolingState
        )
        .setProps({
          validValues: [
            hap.Characteristic.TargetHeatingCoolingState.OFF,
            hap.Characteristic.TargetHeatingCoolingState.HEAT
          ]
        })
        .onGet(
          this.getTargetHeatingState.bind(this)
        )
        .onSet(
          this.setPower.bind(this)
        );

      this.updateDeviceData();

      setInterval(
        this.updateDeviceData.bind(this),
        this.interval * 1000
      );

    }
    catch (error) {
      this.log("Error module " + error);
    }
  }

  getServices() {
    return [
      this.informationService,
      this.thermostatService
    ];
  }

  getCurrentTemperature() {
    return this.temperature;
  }

  getTargetTemperature() {
    return this.targetTemperature;
  }

  getCurrentHeatingState() {

    return this.heaterOn
      ? hap.Characteristic.CurrentHeatingCoolingState.HEAT
      : hap.Characteristic.CurrentHeatingCoolingState.OFF;
  }

  getTargetHeatingState() {

    return this.heaterOn
      ? hap.Characteristic.TargetHeatingCoolingState.HEAT
      : hap.Characteristic.TargetHeatingCoolingState.OFF;
  }

  setTargetTemperature(value) {

    const newTemp = Math.round(value);

    changeTemperatureAPI(
      this,
      newTemp,
      this.targetTemperature
    );

    this.targetTemperature = newTemp;
  }

  setPower(value) {

    const enabled =
      value ===
      hap.Characteristic.TargetHeatingCoolingState.HEAT;

    switchPowerAPI(
      this,
      enabled
    );

    this.heaterOn = enabled;
  }

  updateDeviceData() {

    try {

      this.log("Updating water heater data");

      getDeviceDataAPI(this);

    }
    catch (error) {

      this.log(
        "Error updating device data " +
        error
      );
    }
  }
}

function getDeviceDataAPI(that) {

  try {

    request.post({

      url:
        "https://www.ariston-net.remotethermo.com/R2/Account/Login",

      form: {
        Email: that.username,
        Password: that.password,
        RememberMe: false
      },

      jar: true,
      json: true,

      maxAttempts: 3,
      retryDelay: 6000,
      retryStrategy:
        request.RetryStrategies.HTTPOrNetworkError,

      rejectUnauthorized: false

    },
    function(err, resp) {

      if (err || resp.statusCode !== 200) {

        that.log(
          "Login failed: " +
          err
        );

        return;
      }

      request({

        url:
          "https://www.ariston-net.remotethermo.com/api/v2/velis/medPlantData/" +
          that.plantID,

        jar: true,
        json: true,

        maxAttempts: 3,
        retryDelay: 6000,
        retryStrategy:
          request.RetryStrategies.HTTPOrNetworkError,

        rejectUnauthorized: false

      },
      function(err, resp, body) {

        if (err || resp.statusCode !== 200) {

          that.log(
            "Failed reading data: " +
            err
          );

          return;
        }

        that.temperature =
          body.temp;

        that.targetTemperature =
          body.procReqTemp;

        that.heaterOn =
          body.on;

        that.log(
          "Current Temp: " +
          that.temperature +
          "°C | Target Temp: " +
          that.targetTemperature +
          "°C | Power: " +
          (that.heaterOn
            ? "ON"
            : "OFF")
        );
      });
    });

  }
  catch (error) {

    that.log(
      "getDeviceDataAPI error: " +
      error
    );
  }
}

function changeTemperatureAPI(
  that,
  newTemp,
  oldTemp
) {

  request.post({

    url:
      "https://www.ariston-net.remotethermo.com/R2/Account/Login",

    form: {
      Email: that.username,
      Password: that.password,
      RememberMe: false
    },

    jar: true,
    json: true,

    rejectUnauthorized: false

  },
  function(err, resp) {

    if (err || resp.statusCode !== 200) {

      that.log(
        "Login failed before temperature change"
      );

      return;
    }

    request.post({

      url:
        "https://www.ariston-net.remotethermo.com/api/v2/velis/medPlantData/" +
        that.plantID +
        "/temperature",

      jar: true,
      json: true,

      body: {
        eco: false,
        new: newTemp,
        old: oldTemp
      },

      rejectUnauthorized: false

    },
    function(err, resp, body) {

      if (err || resp.statusCode !== 200) {

        that.log(
          "Temperature change failed: " +
          err
        );

        return;
      }

      that.log(
        "Temperature changed to " +
        newTemp +
        "°C"
      );
    });
  });
}

function switchPowerAPI(
  that,
  enabled
) {

  request.post({

    url:
      "https://www.ariston-net.remotethermo.com/R2/Account/Login",

    form: {
      Email: that.username,
      Password: that.password,
      RememberMe: false
    },

    jar: true,
    json: true,

    rejectUnauthorized: false

  },
  function(err, resp) {

    if (err || resp.statusCode !== 200) {

      that.log(
        "Login failed before power switch"
      );

      return;
    }

    request.post({

      url:
        "https://www.ariston-net.remotethermo.com/api/v2/velis/medPlantData/" +
        that.plantID +
        "/switch",

      jar: true,
      json: true,

      body: enabled,

      rejectUnauthorized: false

    },
    function(err, resp, body) {

      if (err || resp.statusCode !== 200) {

        that.log(
          "Power switch failed: " +
          err
        );

        return;
      }

      that.log(
        "Water heater " +
        (enabled
          ? "ON"
          : "OFF")
      );
    });
  });
}
