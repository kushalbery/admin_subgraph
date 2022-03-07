#!/bin/bash

rm -rf ./graph-node

git clone https://github.com/graphprotocol/graph-node.git

cd './graph-node/docker'

docker-compose up