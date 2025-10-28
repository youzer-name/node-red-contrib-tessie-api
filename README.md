# Node-Red-Contrib-Tessie-API

These nodes are designed to interact with the Tessie API (https://tessie.com) to retrieve information on Tesla vehicles that are connected to Tessie.  

Config nodes:

- For all of the nodes, you must configure a server.  The default base URL is currently https://api.tessie.com.  Enter a valid API token and optionally a name and save the server config
- For the streaming node you must configure a second sever for the websocket connection.  The default base URL is currently wss://streaming.tessie.com.  Add a valid token and optionally a name
- For the tessie-query and tessie-command nodes, you must configure one or more vehicles.  Enter any name and the vehicle VIN and save the vehicle config
- For the tessie-energy-query* and tessie-energy-command nodes, you must configure an energy site.  Enter a name and the site ID
  - *You can run the 'products' query with no site configured.  Look in the response for the energy_site_id and add it to a site config

## Tessie Query Node
To use the tessie-query node:

- Select a server, vehicle and query type
- Any additional fields that are required or available will be displayed
- For the 'From' and 'To' fields, enter a Unix timestamp in seconds.  You can use the date and time fields below the 'From' or 'To' to automatically calculate the Unix timestamp.  When only a date is entered, it sets the timestamp to midnight on that date.  When only a time is entered, it sets that time on the current date.  Calculations are based on local time.

## Tessie Command Node
To use the tessie-command node:
- Select a server, vehicle, and command type
- Any additional fields that are required or available will be displayed

## Tessie Energy Query Node
To use the tessie-energy-query node:
- Select a server, query type, and site (except for 'Products' query)
- Any additional fields that are required or available will be displayed
- All time entries are sent to the API in UTC
  - You can use the date/time pickers to create the correct RFC3339 timestamp by selecting a date and a time
  - You can select 'Local' or 'UTC' as the mode for the time pickers.  When set to 'Local', the date and time you pick will be converted from your local TZ to UTC.  When set to 'UTC', the date and time you pick will not be modified.  You can also directly enter a UTC datetime in RFC3339 format without using the date and time pickers.

## Tessie Energy Command Node
To use the tessie-energy-command node:
 - Select a server, site, and command
 - Any additional fields that are required or available will be displayed

## Tessie Streaming Node
The `tessie-streaming` node connects to the Tessie WebSocket API for real-time streaming data and periodically polls the REST API for full vehicle state data.  It is intended to format the data for output to an MQTT-out node to share the data with subscribers via an MQTT server.  When started, the node will do an inital full data refresh via the REST API.  If the vehicle is awake, it will then open the websocket connection for streaming data.  While the vehicle is awake, it will also do a full REST API refresh on the user-configured interval.  If the vehicle is asleep or goes to sleep, it will close the websocket and begin checking the vehicle state every minute until the vehicle is awake again.  

### Features

- Real-time streaming via WebSocket (e.g., speed, battery level, GPS, climate)
- Periodic full-state refresh via REST API (configurable interval)
- Optional grouping of the periodic data into a single message rather than individual topics
- Unit conversion for distance/temperature/pressure fields (metric or imperial)
- Whitelist/blacklist filtering of data keys
- Debug output for raw data inspection
- Auto-start and manual control via input messages

### Inputs

You can use the node input to stop and start the process or check the 'Auto-start on deploy' option
- `msg.payload = "start"` — Starts streaming and periodic refresh
- `msg.payload = "stop"` — Stops all activity

If you do not check the 'Auto-start on deploy' option, the node will not do anything until it receives a start message.

### Outputs

- **Output 1**: Parsed vehicle data with topic and payload for sending via MQTT
- **Output 2**: Debug data (if debug mode is enabled)

The msg.topic output by the node always takes the form of {root_topic}/{vehicle_name}/{key}.  The root topic is set in the node config.  The vehicle name comes from the name the user set in the Tessie Vehicle Config node.

The node attempts to map the data from the streaming format to the format used in the periodic REST API return.  For example, the streaming API returns "Soc" for the state of charge.  The REST API returns that data in charge_state.battery_level which is output from the node with topic charge_sate/battery_level.  The node converts all streaming keys to lower case then checks its map for a match, in this case soc is mapped to charge_state/battery_level.  So whether the state of charge is received from the websocket streaming or the REST API refresh, it will always be output under the topic charge_state/battery_level.  All unmapped keys are output under the topic "unmapped/{key}"

The node also outputs a heartbeat message every 60 seconds with the topic {root_topic}/{vehicle_name}/heartbeat.

### Configuration

To use the streaming node you must have at least one vehicle and two servers configured.  Currently the server Base URLs should be set to https://api.tessie.com and wss://streaming.tessie.com.
- **Vehicle**: Create or select a vehicle config.  The name configured for this vehicle will be used as the second element of the MQTT topic, after Topic Root
- **Server**: Create or select the Tessie API server config
- **Stream Server**: Create or select the Tessie websocket streaming server config
- **Topic Root**: Base topic prefix for output messages
  - So if you set you Topic Root to "tessie_api" and select a vehicle named "MyModel3", the topic for all messages sent by the node will start with "tessie_api/MyModel3/"
- **Refresh Interval**: Polling interval in seconds for REST API.  Set to 0 to disable periodic refresh
- **Units**: Metric or Imperial.  The node attempts to convert pressure and temp values from psi/°F from bar/°C if Imperial is selected
- **Whitelist/Blacklist**: Filter keys to include/exclude from the output
- **Group Output**: Send periodic data as one grouped message
- **Debug**: Enable console logging and raw output.  When debug is enabled, logs are written to the Node Red logs and the raw streaming or API messages are sent to output 2
- **Auto Start**: Begin streaming on deploy

### Status Indicators

- 🟢 **Green**: Connected and healthy
- 🟡 **Yellow**: Starting up
- 🔴 **Red**: Error in streaming or refresh
- ⚪ **Gray**: Stopped or idle
- 🔵 **Blue**: Vehicle is asleep

## Whitelist and Blacklist Filtering Logic

This node supports optional `whitelist` and `blacklist` filters to control which telemetry keys are published. These filters use **prefix matching**, and follow a clear precedence rule:

### Precedence Rule
> **Specific whitelisted keys override broader blacklists.**

This means if a key matches both a whitelist and a blacklist, the whitelist takes priority and the key will be included.

---

### Behavior Examples

| Scenario | Result |
|----------|--------|
| **Only a whitelist** (e.g. `drive_state/speed`) | Only keys that match or start with `drive_state/speed` will be published. All others are excluded, even if not blacklisted. |
| **Only a blacklist** (e.g. `climate_state`) | All keys are published except those that match or start with `climate_state`. |
| **Whitelist: `charge_state/battery_level`**, Blacklist: `charge_state` | Only `charge_state/battery_level` is published. All other `charge_state` keys are excluded. Keys from other categories (e.g. `drive_state`, `climate_state`) are also excluded because they are not whitelisted. To blacklist ONLY all other charge_state topics, you will need to whitelist the top level of the other topics (e.g. `climate_state`, `media_info`, `drive_state`)|

---

### Notes
- Filters use **prefix matching**, so `charge_state` matches all keys like `charge_state/battery_level`, `charge_state/charging_state`, etc.
- Whitelist entries can be **specific keys** or **prefixes**.
- If the whitelist is **empty**, all keys are considered whitelisted by default.
- If a key matches **both** a whitelist and a blacklist, the whitelist **wins**.


## Screenshots

![tessie nodes](images/tessie-nodes.png)
