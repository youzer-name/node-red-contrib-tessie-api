# Node-Red-Contrib-Tessie-API

These nodes are designed to interact with the Tessie API (https://tessie.com) to retrieve information on Tesla vehicles that are connected to Tessie.  

Config nodes:

- For all of the nodes, you must configure a server.  The default base URL (https://api.tessie.com) should work.  Enter a valid API token and optionally a name and save the server config
- For the tessie-query and tessie-command nodes, you must configure one or more vehicles.  Enter any name and the vehicle VIN and save the vehicle config
- For the tessie-energy-query* and tessie-energy-command nodes, you must configure an energy site.  Enter any name and the site ID
  - *You can run the 'products' query with no site configured.  Look in the msg.payload.response for the energy_site_id and add it to a site config

To use the tessie-query node:

- Select a server, vehicle and query type
- Any additional fields that are required or available will be displayed
- For the 'From' and 'To' fields, enter a Unix timestamp in seconds.  You can use the date and time fields below the 'From' or 'To' to automatically calculate the Unix timestamp.  When only a date is entered, it sets the timestamp to midnight on that date.  When only a time is entered, it sets that time on the current date.  Calculations are based on local time.

To use the tessie-command node:
- Select a server, vehicle, and command type
- Any additional fields that are required or available will be displayed

To use the tessie-energy-query node:
- Select a server, query type, and site (except for 'Products' query)
- Any additional fields that are required or available will be displayed
- All time entries are sent to the API in UTC
  - You can use the date/time pickers to create the correct RFC3339 timestamp by selecting a date and a time
  - You can select 'Local' or 'UTC' as the mode for the time pickers.  When set to 'Local', the date and time you pick will be converted from your local TZ to UTC.  When set to 'UTC', the date and time you pick will not be modified.  You can also directly enter an RFC3339 time string without using the date and time pickers.

To use the tessie-energy-command node:
 - Select a server, site, and command
 - Any additional fields that are required or available will be displayed



## Screenshots

![tessie nodes](images/tessie-nodes.png)
