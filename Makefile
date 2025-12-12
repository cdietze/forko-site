refresh-wasm:
	rm -rf ./src/lib/forko
	mkdir -p ./src/lib/forko
	cp -rv ../2025-11-forko-chess-engine/pkg/* ./src/lib/forko/
	echo "Updated forko WASM files"
