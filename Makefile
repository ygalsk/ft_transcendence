.PHONY: dev up down clean

dev up:
	docker compose up -d --build 

down:
	docker compose down

clean:
	docker compose down -v