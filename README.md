## Prerequisite

Install Ganache-Cli

```sh
npm i -g ganache-cli
```

Install Yarn

```sh
brew install yarn
```

Install Graph

```sh
# NPM
npm install -g @graphprotocol/graph-cli
```

Docker
Node

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
docker-compose up
```

### Step 4

Install npm packges

```sh
npm i
```

### Step 5

Run subgraph

```sh
chmod +x ./start.sh
./start.sh
```

## Query

- Players
  - ````graphQl
    {
      players(first: 1000) {
        id
        currentLongTokenPrice
        currentShortTokenPrice
        questionId
        trade(where: { timestamp_lt: "1647450015" }, first: 1, orderBy: timestamp, orderDirection: desc) {
          id
          longTokenPrice
          shortTokenPrice
          timestamp
          questionId
          fpmm {
            id
          }
        }
      }
    }
    ```
    Replace timestamp_lt value
    ````

## Debug

- In case of your graph-node exit with `admin_subgraph_graph-node_1 exited with code 137` try restarting the graph-node container
- To delete your old containers
  - ```sh
    docker rm $(docker ps -a -q)
    ```
