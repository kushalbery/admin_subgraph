#!/bin/bash

cd subgraph

npm ci

yarn codegen

graph build

yarn create-local

yarn deploy-local