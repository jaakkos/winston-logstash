const express = require('express');
const winston = require('winston');
const LogstashTransport =
  require('winston-logstash/lib/winston-logstash-latest');

// Create a new Express app
const app = express();

// Create a new Winston logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: {service: 'my-nodejs-app'},
  transports: [
    new winston.transports.Console(),
    new LogstashTransport({
      port: 9777,
      node_name: 'my node name',
      host: 'localhost',
      ssl_enable: false,
    }),
  ],
});

// Define a route for the homepage
app.get('/', (req, res) => {
  logger.info('Hello, world!');
  res.send('Hello, world!');
});

// Start the app on port 3000
app.listen(3000, () => {
  logger.info('App started on port 3000');
});

