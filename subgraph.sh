#!/bin/bash

# echo Enter deployed contract address 
# read contractAddress

# echo Enter your github username
# read githubUsername

rm -rf subgraph

graph init --from-contract 0x32Cf1f3a98aeAF57b88b3740875D19912A522c1A kushalbery/subgraph ./subgraph --abi contracts/abis/Gravatar.json

sed -i -e 's/0x2E645469f354BB4F5c8a05B3b30A929361cf77eC/0x32Cf1f3a98aeAF57b88b3740875D19912A522c1A/g' subgraph.yaml

# rm subgraph/src/mapping.ts
# cp mapping.ts subgraph/src/
# rm subgraph/schema.graphql
# cp schema.graphql subgraph/