# vpc

Things that I run in a vpc

## Prerequisites

- Ensure Docker is installed and running on your machine.

## Creating image
  
  ```bash
  docker build -t vpc .
  ```

## Run container
  
  ```bash
  docker run -d -p 3000:3000 vpc
  ```

## Stopping container

  ```bash
  docker stop $(docker ps -a -q)
  ```

## Resume container
  
  ```bash
  docker start $(docker ps -a -q)
  ```

## Delete container

  ```bash
  docker rm $(docker ps -a -q)
  ```
