# Node-Red-Contrib-Tessie-API

These nodes are designed to interact with the Tessie API (https://tessie.com) to retrieve information on Tesla vehicles that are connected to Tessie.  

To use the tessie-query node:

-Add a server.  The default base URL should work: (https://api.tessie.com).  Enter a valid API token.
-Add a vehicle.  Enter any name and a valid VIN.
-Select a query type.
 -Any additional fields that are required or available will be displayed.
 -For the 'From' and 'To' fields, enter a Unix timestamp in seconds.  You can use the date and time fields below the 'From' or 'To' to automatically calculate the Unix timestamp.  When only a date is entered, it sets the timestamp to midnight on that date.  When only a time is entered, it sets that time on the current date.  Calculations are based on local time.


## Screenshots

![tessie nodes](images/tessie-nodes.png)
