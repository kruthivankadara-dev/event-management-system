
const readline = require("node:readline/promises");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const BASE_URL = "http://localhost:5000/api/v1/auth";
const TEST_EMAIL = "abc@gmail.com";

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json();
  return { response, data };
}

async function runTests() {
  try {
    console.log("\n========== EMS-F-016 USER MANAGEMENT TEST ==========\n");

    const email = await rl.question("Admin email: ");
    const password = await rl.question("Admin password: ", {
      hideEchoBack: true
    });

    // 1. Admin login
    const login = await request(`${BASE_URL}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    if (!login.response.ok || !login.data.success) {
      throw new Error("Admin login failed.");
    }

    if (!login.data.data.user.roles.includes("ADMIN")) {
      throw new Error("The logged-in user is not an ADMIN.");
    }

    const token = login.data.data.token;
    console.log("\nPASS: Administrator login");

    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    };

    // 2. Get users
    const usersResult = await request(`${BASE_URL}/users`, {
      headers
    });

    if (!usersResult.response.ok) {
      throw new Error("Could not retrieve users.");
    }

    const testUser = usersResult.data.data.find(
      user => user.email.toLowerCase() === TEST_EMAIL
    );

    if (!testUser) {
      throw new Error(`Test account ${TEST_EMAIL} was not found.`);
    }

    console.log("PASS: Admin can retrieve users");
    console.log("Test account:", testUser.name);
    console.log("Current status:", testUser.accountStatus);

    // 3. Deactivate test account
    const deactivate = await request(
      `${BASE_URL}/users/${testUser.id}/status`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({ accountStatus: "INACTIVE" })
      }
    );

    if (!deactivate.response.ok) {
      throw new Error(
        `Deactivation failed: ${deactivate.data.message}`
      );
    }

    console.log("\nPASS: Test account deactivated");

    // 4. Verify inactive status
    const verifyInactive = await request(`${BASE_URL}/users`, {
      headers
    });

    const inactiveUser = verifyInactive.data.data.find(
      user => user.email.toLowerCase() === TEST_EMAIL
    );

    if (!inactiveUser || inactiveUser.accountStatus !== "INACTIVE") {
      throw new Error("Account status did not change to INACTIVE.");
    }

    console.log("PASS: INACTIVE status verified");

    // 5. Reactivate test account
    const activate = await request(
      `${BASE_URL}/users/${testUser.id}/status`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({ accountStatus: "ACTIVE" })
      }
    );

    if (!activate.response.ok) {
      throw new Error(
        `Reactivation failed: ${activate.data.message}`
      );
    }

    console.log("PASS: Test account reactivated");

    // 6. Verify active status
    const verifyActive = await request(`${BASE_URL}/users`, {
      headers
    });

    const activeUser = verifyActive.data.data.find(
      user => user.email.toLowerCase() === TEST_EMAIL
    );

    if (!activeUser || activeUser.accountStatus !== "ACTIVE") {
      throw new Error("Account was not restored to ACTIVE.");
    }

    console.log("PASS: ACTIVE status verified");

    console.log("\n========== USER MANAGEMENT TESTS PASSED ==========");

  } catch (error) {
    console.error("\nTEST FAILED:", error.message);
    console.log("Check the account status in MySQL before retrying.");
  } finally {
    rl.close();
  }
}

runTests();
