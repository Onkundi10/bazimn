// Client-side logic for Bazimn MVP

// Show a temporary message to the user
function showMessage(text, type = 'success') {
  const msgDiv = document.getElementById('message');
  msgDiv.textContent = text;
  msgDiv.className = `message ${type}`;
  msgDiv.classList.remove('hidden');
  // Hide after 4 seconds
  setTimeout(() => {
    msgDiv.classList.add('hidden');
  }, 4000);
}

// Build and show the login form
function showLoginForm() {
  const authSection = document.getElementById('auth-section');
  authSection.innerHTML = `
    <h2>Sign In</h2>
    <form id="login-form">
      <label>Email
        <input type="email" name="email" required>
      </label>
      <label>Password
        <input type="password" name="password" required>
      </label>
      <button type="submit">Login</button>
    </form>
    <p>Don\'t have an account? <a href="#" id="show-register-link">Register</a></p>
  `;
  document.getElementById('login-form').addEventListener('submit', loginUser);
  document.getElementById('show-register-link').addEventListener('click', (e) => {
    e.preventDefault();
    showRegisterForm();
  });
}

// Build and show the registration form
function showRegisterForm() {
  const authSection = document.getElementById('auth-section');
  authSection.innerHTML = `
    <h2>Create Account</h2>
    <form id="register-form">
      <label>Username
        <input type="text" name="username" required>
      </label>
      <label>Email
        <input type="email" name="email" required>
      </label>
      <label>Password
        <input type="password" name="password" required>
      </label>
      <label>Role
        <select name="role" required>
          <option value="buyer">Buyer</option>
          <option value="seller">Seller</option>
        </select>
      </label>
      <button type="submit">Register</button>
    </form>
    <p>Already have an account? <a href="#" id="show-login-link">Login</a></p>
  `;
  document.getElementById('register-form').addEventListener('submit', registerUser);
  document.getElementById('show-login-link').addEventListener('click', (e) => {
    e.preventDefault();
    showLoginForm();
  });
}

// Handle registration form submission
async function registerUser(event) {
  event.preventDefault();
  const form = event.target;
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (res.ok) {
      showMessage('Registration successful! Please log in.', 'success');
      showLoginForm();
    } else {
      showMessage(data.error || 'Registration failed', 'error');
    }
  } catch (err) {
    showMessage('Network error', 'error');
  }
}

// Handle login form submission
async function loginUser(event) {
  event.preventDefault();
  const form = event.target;
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (res.ok) {
      // Save token and role in localStorage
      localStorage.setItem('token', data.token);
      localStorage.setItem('role', data.role);
      localStorage.setItem('userId', data.userId);
      showMessage('Login successful', 'success');
      checkAuth();
    } else {
      showMessage(data.error || 'Login failed', 'error');
    }
  } catch (err) {
    showMessage('Network error', 'error');
  }
}

// Logout the user
function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('role');
  localStorage.removeItem('userId');
  showLoginForm();
  document.getElementById('create-gig-section').classList.add('hidden');
  fetchGigs();
}

// Fetch the list of gigs from server
async function fetchGigs() {
  try {
    const res = await fetch('/api/gigs');
    const data = await res.json();
    if (res.ok) {
      renderGigs(data.gigs);
    }
  } catch (err) {
    console.error('Error fetching gigs:', err);
  }
}

// Render gigs in the DOM
function renderGigs(gigs) {
  const gigsDiv = document.getElementById('gigs');
  gigsDiv.innerHTML = '';
  const role = localStorage.getItem('role');
  const userId = localStorage.getItem('userId');
  gigs.forEach(gig => {
    const card = document.createElement('div');
    card.className = 'gig-card';
    const title = document.createElement('h3');
    title.textContent = gig.title;
    const desc = document.createElement('p');
    desc.textContent = gig.description;
    const price = document.createElement('p');
    price.textContent = `Price: $${gig.price}`;
    card.appendChild(title);
    card.appendChild(desc);
    card.appendChild(price);
    // Determine button based on user role
    if (role === 'buyer') {
      const btn = document.createElement('button');
      btn.textContent = 'Order';
      btn.addEventListener('click', () => orderGig(gig.id));
      card.appendChild(btn);
    } else if (role === 'seller') {
      if (gig.sellerId === userId) {
        const note = document.createElement('span');
        note.textContent = 'Your gig';
        card.appendChild(note);
      }
      // Sellers cannot order their own gigs
    } else {
      const info = document.createElement('span');
      info.textContent = 'Login to order';
      card.appendChild(info);
    }
    gigsDiv.appendChild(card);
  });
}

// Handle gig creation by seller
async function createGig(event) {
  event.preventDefault();
  const form = event.target;
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  // Convert price to number
  payload.price = parseFloat(payload.price);
  try {
    const token = localStorage.getItem('token');
    const res = await fetch('/api/gigs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (res.ok) {
      showMessage('Gig created successfully', 'success');
      form.reset();
      fetchGigs();
    } else {
      showMessage(data.error || 'Failed to create gig', 'error');
    }
  } catch (err) {
    showMessage('Network error', 'error');
  }
}

// Handle ordering a gig by buyer
async function orderGig(gigId) {
  try {
    const token = localStorage.getItem('token');
    if (!token) {
      return showMessage('Please log in as a buyer to order', 'error');
    }
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token
      },
      body: JSON.stringify({ gigId })
    });
    const data = await res.json();
    if (res.ok) {
      showMessage('Order placed successfully', 'success');
    } else {
      showMessage(data.error || 'Failed to place order', 'error');
    }
  } catch (err) {
    showMessage('Network error', 'error');
  }
}

// Check authentication status and update UI accordingly
function checkAuth() {
  const token = localStorage.getItem('token');
  const role = localStorage.getItem('role');
  const authSection = document.getElementById('auth-section');
  const createGigSection = document.getElementById('create-gig-section');
  if (token && role) {
    // Logged in
    // Display greeting and logout button
    const username = localStorage.getItem('username');
    authSection.innerHTML = '';
    const p = document.createElement('p');
    p.textContent = `Logged in as ${role}`;
    const logoutBtn = document.createElement('button');
    logoutBtn.textContent = 'Logout';
    logoutBtn.addEventListener('click', logout);
    authSection.appendChild(p);
    authSection.appendChild(logoutBtn);
    // Show gig creation if seller
    if (role === 'seller') {
      createGigSection.classList.remove('hidden');
      document.getElementById('create-gig-form').addEventListener('submit', createGig);
    } else {
      createGigSection.classList.add('hidden');
    }
  } else {
    // Not logged in
    createGigSection.classList.add('hidden');
    showLoginForm();
  }
  fetchGigs();
}

document.addEventListener('DOMContentLoaded', checkAuth);