#!/bin/bash


rm -fv `pwd`/test/support/ssl/ca.*
rm -fv `pwd`/test/support/ssl/server.*
rm -fv `pwd`/test/support/ssl/client.*

echo "Generating CA key"
openssl genrsa -out `pwd`/test/support/ssl/ca.key 2048

echo "Generate CA key and sertificate"
openssl req -nodes -new -x509 -key `pwd`/test/support/ssl/ca.key \
  -out `pwd`/test/support/ssl/ca.cert \
  -days 3650 \
  -subj '/CN=example.com/O=My Company Name LTD./C=FI'

echo "Generating certificate signing request for server"
openssl req -nodes -new -newkey rsa:2048 -keyout `pwd`/test/support/ssl/server.key \
  -out `pwd`/test/support/ssl/server.csr \
  -config `pwd`/test/support/ssl/csr.config \
  -subj '/CN=server.example.com/O=My Company Name LTD./C=FI'

echo "Generating certificate from generated request for server"
openssl x509 -req -CAcreateserial -in `pwd`/test/support/ssl/server.csr \
  -CA `pwd`/test/support/ssl/ca.cert \
  -CAkey `pwd`/test/support/ssl/ca.key \
  -days 3650 \
  -out `pwd`/test/support/ssl/server.cert

echo "Generating certificate signing request for client"
openssl req -nodes -new -newkey rsa:2048 -keyout `pwd`/test/support/ssl/client.key \
  -out `pwd`/test/support/ssl/client.csr \
  -config `pwd`/test/support/ssl/csr.config \
  -subj '/CN=client.example.com/O=My Company Name LTD./C=FI'

echo "Generating certificate from generated request for client"
openssl x509 -req -CAcreateserial -in `pwd`/test/support/ssl/client.csr \
  -CA `pwd`/test/support/ssl/ca.cert \
  -CAkey `pwd`/test/support/ssl/ca.key \
  -out `pwd`/test/support/ssl/client.cert \
  -days 365 \
  -extfile `pwd`/test/support/ssl/csr.config

echo "Generated CA certicate"
echo
openssl x509 -in `pwd`/test/support/ssl/ca.cert -noout -text
echo

echo "Generated certicate for server"
echo
openssl x509 -in `pwd`/test/support/ssl/server.cert -noout -text
echo

echo "Generated certicate for client"
echo
openssl x509 -in `pwd`/test/support/ssl/client.cert -noout -text
echo
