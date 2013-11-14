#!/bin/bash

echo Generating server key
openssl genrsa -out server.key 2048

echo Generating certificate signing request 
openssl req -new -key server.key -out server.csr -config csr.config

echo Generating certificate from generated request
openssl x509 -req -in server.csr -signkey server.key -out server.cert -extfile csr.config -extensions v3_req 

echo Generated certicate
echo
openssl x509 -in server.cert -noout -text  
