## Installing and Running

### Step 1

Clone this repo

```sh
git clone https://github.com/kushalbery/admin_subgraph.git
```

### Step 2

Run Ganache-Cli

```sh
ganache-cli -h 0.0.0.0 -d  --account_keys_path=keys.json -l=15000000
```

### Step 3

Clone and Run local graph node

```sh
chmod +x ./graph-node.sh
./graph-node.sh
```

### Step 4

Run subgraph

```sh
chmod +x ./start.sh
./start.sh
```
