require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const TempRegistration = require('./models/TempRegistration');

const run = async () => {
    console.log("Starting TTL Removal Script...");
    await connectDB();

    try {
        const indexes = await TempRegistration.collection.indexes();
        console.log("Current Indexes Found:", indexes.length);

        let found = false;
        for (const idx of indexes) {
            if (idx.expireAfterSeconds !== undefined) {
                console.log(`Found TTL Index: '${idx.name}' (expires after ${idx.expireAfterSeconds}s). Deleting...`);
                await TempRegistration.collection.dropIndex(idx.name);
                console.log("SUCCESS: Index dropped.");
                found = true;
            }
        }

        if (!found) {
            console.log("No TTL/Expiration index found. Nothing to do.");
        }

    } catch (err) {
        console.error("ERROR:", err.message);
    }

    console.log("Done.");
    process.exit();
};

run();
