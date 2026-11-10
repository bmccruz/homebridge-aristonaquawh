<div align="center">
  <p>☕ <strong>Support the project:</strong> <a href="https://buymeacoffee.com/bmccruz">Buy Me a Coffee</a></p>
</div>

# homebridge-aristonaquawh
Homebridge module for Ariston Aqua Water Heater

## License

This project is licensed under the ISC License. See [LICENSE](LICENSE) for details.

## Description

Homebridge plugin gets the current temperature from Ariston Aqua Water Heaters, like Velis and Velis Tech Dry.
The plugin uses the data from https://www.ariston-net.remotethermo.com/ so you need to have a account there, is the same as the Ariston mobile app. Put the account data on the plugin configuration (see below), the plandID for you device is the ID you see on the URL once you log in into the wesite.

## Features

- Reports the water heater's current temperature to HomeKit.
- Supports thermostat modes: Off, Heat, and Auto (Ariston Eco Mode).
- Maps the unsupported Cool mode to Heat.

## Installation

1. Install homebridge using: `npm install -g homebridge`
2. Install this plugin using: `npm install -g homebridge-aristonaquawh`
3. Update your configuration file. See the sample below.

If you do not wish to install from npm (e.g, because you are using a fork), you
may also clone the git repository into some directory like
`/usr/local/homebridge/plugins/homebridge-aristonaquawh` and then specify the
plugin directory as an option (`-P /usr/local/homebridge/plugins`, typically
using `HOMEBRIDGE_OPTS` in `/etc/default/homebridge`).

## Configuration
 
Example accessory config (needs to be added to the Homebridge `config.json`):

  ```
 "accessories": [
     {
        "accessory": "AristonAquaWH",
        "name": "Water Heater",
        "username": "email@email.com",
        "password": "passss",
        "plantID": "XXXX",
        "model": "VELIS Tech Dry",
        "serial_number": "123456789"
     }
 ]
  ```

## Contributing

Bug reports and contributions are welcome. Please open an issue to report a problem or discuss a proposed change, and submit a pull request for contributions.