## Configuration

* `host` - The host location of the logstash server. (`127.0.0.1`)
* `port` - The host port to connect. (`28777`)
* `max_connect_retries` - Max number of attempts to reconnect to logstash before going into silence. `-1` means retry forever. (`4`)
* `ssl_enable` - Enable SSL transfer of logs to logstash. (`false`)
* `ssl_key` - Path location of client private key. Only needed if SSL verify is required on logstash. (No default)
* `ssl_cert` - Path location of client public certificate. Only needed if SSL verify is required on logstash. (No default)
* `ssl_passphrase` - Passphrase for the SSL key. Only needed if the certificate has a passphrase. (No default)
