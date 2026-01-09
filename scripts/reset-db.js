// ...existing code...

async function resetDb() {
	// ...existing reset logic...
	// For example: clear DB collections and seed sample data
	// ...existing code...
}

if (require.main === module) {
	resetDb()
		.then(() => { console.log('DB reset finished'); process.exit(0); })
		.catch(err => { console.error(err); process.exit(1); });
}

module.exports = resetDb;