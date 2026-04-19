"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = require("./app");
(0, app_1.startGateway)().catch((error) => {
    console.error(error);
    process.exit(1);
});
