
const readline = require("node:readline/promises");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const BASE_URL = "http://localhost:5000/api/v1";
const suffix = Date.now();

async function api(path, token, method = "GET", body) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });

  const data = await response.json();
  return { status: response.status, data };
}

async function runTests() {
  try {
    console.log("\n========== EMS-F-016 CATALOG TEST ==========\n");

    const email = await rl.question("Admin email: ");
    const password = await rl.question("Admin password: ", {
      hideEchoBack: true
    });

    // 1. Admin login
    const loginResponse = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    const login = await loginResponse.json();

    if (!loginResponse.ok || !login.success ||
        !login.data.user.roles.includes("ADMIN")) {
      throw new Error("Administrator login failed.");
    }

    const token = login.data.token;
    console.log("\nPASS: Administrator login");

    // 2. Create venue
    const venueName = `EMS Test Venue ${suffix}`;

    const venueResult = await api("/admin/venues", token, "POST", {
      venueName,
      address: "Hyderabad",
      description: "Temporary venue for EMS-F-016 testing"
    });

    if (venueResult.status !== 201) {
      throw new Error(venueResult.data.message || "Venue creation failed.");
    }

    const venueId = venueResult.data.data.venueId;
    console.log("PASS: Venue creation");

    // 3. List venues
    const venues = await api("/admin/venues", token);
    console.log("CREATED VENUE ID:", venueId);
console.log("VENUE LIST RESPONSE:", JSON.stringify(venues.data, null, 2));

    if (!venues.data.data.some(v => v.venueId === venueId)) {
  throw new Error("Created venue not found in venue list.");
}

    console.log("PASS: Venue listing");

    // 4. Update venue
    const venueUpdate = await api(
      `/admin/venues/${venueId}`,
      token,
      "PUT",
      {
        venueName: `${venueName} Updated`,
        address: "Bengaluru",
        description: "Updated test venue"
      }
    );

    if (venueUpdate.status !== 200) {
      throw new Error(venueUpdate.data.message || "Venue update failed.");
    }

    console.log("PASS: Venue update");

    // 5. Deactivate and reactivate venue
    for (const isActive of [false, true]) {
      const result = await api(
        `/admin/venues/${venueId}/status`,
        token,
        "PATCH",
        { isActive }
      );

      if (result.status !== 200) {
        throw new Error(result.data.message || "Venue status update failed.");
      }
    }

    console.log("PASS: Venue deactivation and reactivation");

    // 6. Create category
    const categoryName = `EMS Test Category ${suffix}`;

    const categoryResult = await api(
      "/admin/categories",
      token,
      "POST",
      {
        categoryName,
        description: "Temporary category for EMS-F-016 testing"
      }
    );

    if (categoryResult.status !== 201) {
      throw new Error(categoryResult.data.message || "Category creation failed.");
    }

    const categoryId = categoryResult.data.data.categoryId;
    console.log("PASS: Category creation");

    // 7. List categories
    const categories = await api("/admin/categories", token);

    if (!categories.data.data.some(c => c.categoryId === categoryId)) {
  throw new Error("Created category not found in category list.");
}

    console.log("PASS: Category listing");

    // 8. Update category
    const categoryUpdate = await api(
      `/admin/categories/${categoryId}`,
      token,
      "PUT",
      {
        categoryName: `${categoryName} Updated`,
        description: "Updated test category"
      }
    );

    if (categoryUpdate.status !== 200) {
      throw new Error(categoryUpdate.data.message || "Category update failed.");
    }

    console.log("PASS: Category update");

    // 9. Deactivate and reactivate category
    for (const isActive of [false, true]) {
      const result = await api(
        `/admin/categories/${categoryId}/status`,
        token,
        "PATCH",
        { isActive }
      );

      if (result.status !== 200) {
        throw new Error(result.data.message || "Category status update failed.");
      }
    }

    console.log("PASS: Category deactivation and reactivation");

    console.log("\n========== ALL CATALOG TESTS PASSED ==========");
    console.log("Test venue:", venueId);
    console.log("Test category:", categoryId);
    console.log("Both test records are ACTIVE.");

  } catch (error) {
    console.error("\nTEST FAILED:", error.message);
  } finally {
    rl.close();
  }
}


runTests();
