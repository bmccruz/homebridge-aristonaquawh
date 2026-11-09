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

      // 1. Alterado para o Serviço HeaterCooler
      this.heaterCoolerService = new hap.Service.HeaterCooler(this.name);

      this.heaterCoolerService
        .getCharacteristic(hap.Characteristic.CurrentTemperature)
        .onGet(this.getCurrentTemperature.bind(this));

      // 2. No HeaterCooler, o slider de setpoint usa HeatingThresholdTemperature
      this.heaterCoolerService
        .getCharacteristic(hap.Characteristic.HeatingThresholdTemperature)
        .setProps({
          minValue: 40,
          maxValue: 80,
          minStep: 1
        })
        .onGet(this.getTargetTemperature.bind(this))
        .onSet(this.setTargetTemperature.bind(this));

      // 3. Estado Atual: Apenas Desligado (INACTIVE) ou Aquecendo (HEATING)
      this.heaterCoolerService
        .getCharacteristic(hap.Characteristic.CurrentHeaterCoolerState)
        .setProps({
          validValues: [
            hap.Characteristic.CurrentHeaterCoolerState.INACTIVE,
            hap.Characteristic.CurrentHeaterCoolerState.HEATING
          ]
        })
        .onGet(this.getCurrentHeatingState.bind(this));

      // 4. Estado Alvo: Força aceitar apenas o modo HEAT (Aquecer)
      this.heaterCoolerService
        .getCharacteristic(hap.Characteristic.TargetHeaterCoolerState)
        .setProps({
          validValues: [
            hap.Characteristic.TargetHeaterCoolerState.HEAT
          ]
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
      this.heaterCoolerService
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
      ? hap.Characteristic.CurrentHeaterCoolerState.HEATING
      : hap.Characteristic.CurrentHeaterCoolerState.INACTIVE;
  }

  getTargetHeatingState() {
    // Como forçámos apenas o HEAT nas props, retornamos sempre HEAT quando ligado
    return this.heaterOn
      ? hap.Characteristic.TargetHeaterCoolerState.HEAT
      : hap.Characteristic.TargetHeaterCoolerState.HEAT;
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
    // Na app Casa, clicar no botão de ligar/desligar principal altera o Active
    // Mas se alterarem o modo ou usarem automações, validamos pelo estado do botão
    this.log("SetPower acionado com o valor: " + value);
  }

  updateDeviceData() {
    try {
      this.log("Updating water heater data");
      getDeviceDataAPI(this);
    } catch (error) {
      this.log("Error updating device data " + error);
    }
  }
}

function getDeviceDataAPI(that) {
  request.post({
    url: "https://www.ariston-net.remotethermo.com/R2/Account/Login",
    form: {
      Email: that.username,
      Password: that.password,
      RememberMe: false
    },
    jar: that.cookieJar,
    json: true,
    maxAttempts: 3,
    retryDelay: 6000,
    retryStrategy: request.RetryStrategies.HTTPOrNetworkError,
    rejectUnauthorized: false
  },
  function(err, resp) {
    if (err || resp.statusCode !== 200) {
      that.log("Login failed");
      return;
    }

    request({
      url: "https://www.ariston-net.remotethermo.com/api/v2/velis/medPlantData/" + that.plantID,
      jar: that.cookieJar,
      json: true,
      maxAttempts: 3,
      retryDelay: 6000,
      retryStrategy: request.RetryStrategies.HTTPOrNetworkError,
      rejectUnauthorized: false
    },
    function(err, resp, body) {
      if (err || resp.statusCode !== 200) {
        that.log("Reading device data failed");
        return;
      }

      if (body) {
        if (typeof body.temp === "number") {
          that.temperature = body.temp;
        }
        if (typeof body.procReqTemp === "number") {
          that.targetTemperature = body.procReqTemp;
        }
        if (typeof body.on === "boolean") {
          that.heaterOn = body.on;
        }
      }

      // Atualizações de características corrigidas para o novo serviço HeaterCooler
      that.heaterCoolerService.updateCharacteristic(
        hap.Characteristic.CurrentTemperature,
        that.temperature
      );

      that.heaterCoolerService.updateCharacteristic(
        hap.Characteristic.HeatingThresholdTemperature,
        that.targetTemperature
      );

      that.heaterCoolerService.updateCharacteristic(
        hap.Characteristic.CurrentHeaterCoolerState,
        that.heaterOn
          ? hap.Characteristic.CurrentHeaterCoolerState.HEATING
          : hap.Characteristic.CurrentHeaterCoolerState.INACTIVE
      );

      that.heaterCoolerService.updateCharacteristic(
        hap.Characteristic.TargetHeaterCoolerState,
        hap.Characteristic.TargetHeaterCoolerState.HEAT
      );

      // Sincroniza também a característica Active (LIGADO/DESLIGADO nativo do HeaterCooler)
      that.heaterCoolerService.updateCharacteristic(
        hap.Characteristic.Active,
        that.heaterOn ? hap.Characteristic.Active.ACTIVE : hap.Characteristic.Active.INACTIVE
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

function changeTemperatureAPI(that, newTemp, oldTemp) {
  request.post({
    url: "https://www.ariston-net.remotethermo.com/R2/Account/Login",
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
      that.log("Login failed before changing temperature");
      return;
    }

    request.post({
      url: "https://www.ariston-net.remotethermo.com/api/v2/velis/medPlantData/" + that.plantID + "/temperature",
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
        that.log("Changing temperature failed");
        return;
      }
      that.log("Temperature changed to " + newTemp + "°C");
    });
  });
}

function switchPowerAPI(that, enabled) {
  request.post({
    url: "https://www.ariston-net.remotethermo.com/R2/Account/Login",
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
      that.log("Login failed before switch");
      return;
    }

    request.post({
      url: "https://www.ariston-net.remotethermo.com/api/v2/velis/medPlantData/" + that.plantID + "/switch",
      jar: that.cookieJar,
      json: true,
      body: enabled,
      rejectUnauthorized: false
    },
    function(err, resp) {
      if (err || resp.statusCode !== 200) {
        that.log("Switch failed");
        return;
      }
      that.log("Water heater " + (enabled ? "ON" : "OFF"));
    });
  });
  