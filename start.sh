#!/bin/bash

yarn codegen

graph build

yarn create-local

yarn deploy-local