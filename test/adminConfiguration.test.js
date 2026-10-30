const BASE_URL = "http://localhost:5000/api/v1";

async function runTests() {
  try {
    // 1. Admin login
    const loginResponse = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "vkruthi1708@gmail.com",
        password: "12345678"
      })
    });

    const loginData = await loginResponse.json();

    if (!loginResponse.ok) {
      throw new Error("Admin login failed: " + JSON.stringify(loginData));
    }

    const token = loginData.token ?? loginData.data?.token;

if (!token) {
  throw new Error("Login succeeded but token was not found.");
}

console.log("PASS: Admin login");

    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    };

    // 2. Create a test configuration
    const configKey = `ems_test_setting_${Date.now()}`;

    const createResponse = await fetch(
      `${BASE_URL}/admin/configurations/${configKey}`,
      {
        method: "PUT",
        headers,
        body: JSON.stringify({
          configValue: {
            enabled: true,
            message: "EMS configuration test"
          },
          description: "Temporary test configuration"
        })
      }
    );

    const createData = await createResponse.json();

    if (!createResponse.ok) {
      throw new Error("Configuration creation failed: " + JSON.stringify(createData));
    }

    console.log("PASS: Create configuration");

    // 3. Read configurations
    const listResponse = await fetch(
      `${BASE_URL}/admin/configurations`,
      { headers }
    );

    const listData = await listResponse.json();
    console.log("Configuration list response:", JSON.stringify(listData, null, 2));

    if (!listResponse.ok) {
      throw new Error("Configuration listing failed: " + JSON.stringify(listData));
    }

    const configurations = listData.data;

    const createdConfig = configurations?.find(
      item => item.configKey === configKey
    );

    if (!createdConfig) {
      throw new Error("Created configuration was not found in the list.");
    }

    console.log("PASS: Read configuration");

    // 4. Update configuration
    const updateResponse = await fetch(
      `${BASE_URL}/admin/configurations/${configKey}`,
      {
        method: "PUT",
        headers,
        body: JSON.stringify({
          configValue: {
            enabled: false,
            message: "Updated EMS configuration"
          },
          description: "Updated test configuration"
        })
      }
    );

    const updateData = await updateResponse.json();

    if (!updateResponse.ok) {
      throw new Error("Configuration update failed: " + JSON.stringify(updateData));
    }

    console.log("PASS: Update configuration");

    console.log("\nAll configuration API tests passed!");
    console.log("Test configuration key:", configKey);

  } catch (error) {
    console.error("\nTEST FAILED:", error.message);
    process.exitCode = 1;
  }
}

runTests();