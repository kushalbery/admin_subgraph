#!/bin/bash

cd subgraph

yarn codegen

graph build

yarn create-local

yarn deploy-local