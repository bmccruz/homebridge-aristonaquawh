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
      this.heaterOn = false;

      this.cookieJar = request.jar();

      this.informationService = new hap.Service.AccessoryInformation();

      this.informationService
        .setCharacteristic(hap.Characteristic.Name, this.name)
        .setCharacteristic(hap.Characteristic.Manufacturer, "Ariston")
        .setCharacteristic(hap.Characteristic.Model, this.model)
        .setCharacteristic(hap.Characteristic.SerialNumber, this.serial_number);

      this.thermostatService =
        new hap.Service.Thermostat(this.name);

      this.thermostatService
        .getCharacteristic(hap.Characteristic.CurrentTemperature)
        .onGet(this.getCurrentTemperature.bind(this));

      this.thermostatService
        .getCharacteristic(hap.Characteristic.TargetTemperature)
        .setProps({
          minValue: 40,
          maxValue: 80,
          minStep: 1
        })
        .onGet(this.getTargetTemperature.bind(this))
        .onSet(this.setTargetTemperature.bind(this));

      this.thermostatService
        .getCharacteristic(
          hap.Characteristic.CurrentHeatingCoolingState
        )
        .onGet(this.getCurrentHeatingState.bind(this));

      this.thermostatService
        .getCharacteristic(
          hap.Characteristic.TargetHeatingCoolingState
        )
        .setProps({
          minValue: 0,
          maxValue: 3,
          minStep: 1
        })
        .onGet(this.getTargetHeatingState.bind(this))
        .onSet(this.setPower.bind(this));

      this.updateDeviceData();

      setInterval(
        this.updateDeviceData.bind(this),
        this.interval * 1000
      );

    } catch (error) {

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

    const newTemp = Math.max(
      40,
      Math.min(
        80,
        Math.round(value)
      )
    );

    changeTemperatureAPI(
      this,
      newTemp,
      this.targetTemperature
    );

    this.targetTemperature = newTemp;
  }

  setPower(value) {

    this.log("Mode receiced: " + value);

    switch (value) {

      case hap.Characteristic.TargetHeatingCoolingState.OFF:
  
        switchPowerAPI(this, false);
        this.heaterOn = false;
        break;
  
      case hap.Characteristic.TargetHeatingCoolingState.HEAT:
  
        switchPowerAPI(this, true);
        
        switchEcoAPI(this, false);
        
        this.heaterOn = true;
        break;
        
      case hap.Characteristic.TargetHeatingCoolingState.COOL:

        this.thermostatService.updateCharacteristic(
          hap.Characteristic.TargetHeatingCoolingState,
          hap.Characteristic.TargetHeatingCoolingState.HEAT
        );
      
        switchPowerAPI(this, true);

        switchEcoAPI(this, false);

        this.heaterOn = true;
        break;

      case hap.Characteristic.TargetHeatingCoolingState.AUTO:
  
        switchPowerAPI(this, true);
  
        switchEcoAPI(this, true);
  
        this.heaterOn = true;
        break;
    }
  }

  updateDeviceData() {

    try {

      this.log("Updating water heater data");

      getDeviceDataAPI(this);

    } catch (error) {

      this.log(
        "Error updating device data " +
        error
      );
    }
  }
}

function getDeviceDataAPI(that) {

  request.post({

    url:
      "https://www.ariston-net.remotethermo.com/R2/Account/Login",

    form: {
      Email: that.username,
      Password: that.password,
      RememberMe: false
    },

    jar: that.cookieJar,
    json: true,

    maxAttempts: 3,
    retryDelay: 6000,
    retryStrategy:
      request.RetryStrategies.HTTPOrNetworkError,

    rejectUnauthorized: false

  },
  function(err, resp) {

    if (err || resp.statusCode !== 200) {

      that.log("Login failed");

      return;
    }

    request({

      url:
        "https://www.ariston-net.remotethermo.com/api/v2/velis/medPlantData/" +
        that.plantID,

      jar: that.cookieJar,
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
          "Reading device data failed"
        );

        return;
      }

      if (body) {

        if (typeof body.temp === "number") {
          that.temperature = body.temp;
        }

        if (typeof body.procReqTemp === "number") {
          that.targetTemperature =
            body.procReqTemp;
        }

        if (typeof body.on === "boolean") {
          that.heaterOn =
            body.on;
        }
      }

      that.thermostatService.updateCharacteristic(
        hap.Characteristic.CurrentTemperature,
        that.temperature
      );

      that.thermostatService.updateCharacteristic(
        hap.Characteristic.TargetTemperature,
        that.targetTemperature
      );

      that.thermostatService.updateCharacteristic(
        hap.Characteristic.CurrentHeatingCoolingState,
        that.heaterOn
          ? hap.Characteristic.CurrentHeatingCoolingState.HEAT
          : hap.Characteristic.CurrentHeatingCoolingState.OFF
      );

      that.thermostatService.updateCharacteristic(
        hap.Characteristic.TargetHeatingCoolingState,
        that.heaterOn
          ? hap.Characteristic.TargetHeatingCoolingState.HEAT
          : hap.Characteristic.TargetHeatingCoolingState.OFF
      );

      that.log(
        "Current: " +
        that.temperature +
        "°C Target: " +
        that.targetTemperature +
        "°C Power: " +
        (that.heaterOn ? "ON" : "OFF")
      );
    });
  });
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

    jar: that.cookieJar,
    json: true,

    rejectUnauthorized: false

  },
  function(err, resp) {

    if (err || resp.statusCode !== 200) {

      that.log(
        "Login failed before changing temperature"
      );

      return;
    }

    request.post({

      url:
        "https://www.ariston-net.remotethermo.com/api/v2/velis/medPlantData/" +
        that.plantID +
        "/temperature",

      jar: that.cookieJar,
      json: true,

      body: {
        eco: false,
        new: newTemp,
        old: oldTemp
      },

      rejectUnauthorized: false

    },
    function(err, resp) {

      if (err || resp.statusCode !== 200) {

        that.log(
          "Changing temperature failed"
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

    jar: that.cookieJar,
    json: true,

    rejectUnauthorized: false

  },
  function(err, resp) {

    if (err || resp.statusCode !== 200) {

      that.log(
        "Login failed before switch"
      );

      return;
    }

    request.post({

      url:
        "https://www.ariston-net.remotethermo.com/api/v2/velis/medPlantData/" +
        that.plantID +
        "/switch",

      jar: that.cookieJar,
      json: true,

      body: enabled,

      rejectUnauthorized: false

    },
    function(err, resp) {

      if (err || resp.statusCode !== 200) {

        that.log(
          "Switch failed"
        );

        return;
      }

      that.log(
        "Water heater " +
        (enabled ? "ON" : "OFF")
      );
    });
  });
}

function switchEcoAPI(
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

    jar: that.cookieJar,
    json: true,

    rejectUnauthorized: false

  },
  function(err, resp) {

    if (err || resp.statusCode !== 200) {

      that.log(
        "Login failed before switch"
      );

      return;
    }

    request.post({

      url:
        "https://www.ariston-net.remotethermo.com/api/v2/velis/medPlantData/" +
        that.plantID +
        "/switchEco",

      jar: that.cookieJar,
      json: true,

      body: enabled,

      rejectUnauthorized: false

    },
    function(err, resp) {

      if (err || resp.statusCode !== 200) {

        that.log(
          "Switch failed"
        );

        return;
      }

      that.log(
        "Water heater " +
        (enabled ? "ON" : "OFF")
      );
    });
  });
}