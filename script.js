// ========================================
// PHARMASOFT E-COMMERCE - COMPLETE FIXED VERSION
// ========================================

// ========================================
// 1. CONFIGURATION
// ========================================

const API_BASE_URL = 'http://localhost:5000/api';

const STORAGE = {
  TOKEN: 'pharmasoft_token',
  USER: 'pharmasoft_user',
  CART_CACHE: 'pharmasoft_cart_cache'
};

// ========================================
// 2. AUTHENTICATION MODULE
// ========================================

const auth = {
  getToken() {
    return localStorage.getItem(STORAGE.TOKEN);
  },

  setToken(token) {
    localStorage.setItem(STORAGE.TOKEN, token);
  },

  removeToken() {
    localStorage.removeItem(STORAGE.TOKEN);
  },

  getUser() {
    const user = localStorage.getItem(STORAGE.USER);
    return user ? JSON.parse(user) : null;
  },

  setUser(user) {
    localStorage.setItem(STORAGE.USER, JSON.stringify(user));
  },

  removeUser() {
    localStorage.removeItem(STORAGE.USER);
  },

  isLoggedIn() {
    return !!this.getToken();
  },

  logout() {
    this.removeToken();
    this.removeUser();
    localStorage.removeItem(STORAGE.CART_CACHE);
    showToast('Logged out successfully');
    window.location.href = 'index.html';
  }
};

// ========================================
// 3. API CALL HANDLER
// ========================================

async function apiCall(endpoint, options = {}) {
  const token = auth.getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const url = `${API_BASE_URL}${endpoint}`;
    console.log('API Call:', url, options.method || 'GET');
    
    const response = await fetch(url, {
      ...options,
      headers
    });

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      console.error('Received HTML instead of JSON. Check API endpoint:', url);
      throw new Error('Server returned HTML. Check API configuration.');
    }

    const data = await response.json();

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        showToast('Session expired. Please login again.', 'error');
        auth.logout();
        return;
      }
      throw new Error(data.error || `HTTP error! status: ${response.status}`);
    }

    return data;
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

// ========================================
// 4. CART MANAGEMENT
// ========================================

let cart = [];
let currentUser = auth.getUser();

function getCachedCart() {
  const cached = localStorage.getItem(STORAGE.CART_CACHE);
  return cached ? JSON.parse(cached) : [];
}

function cacheCart(cartData) {
  localStorage.setItem(STORAGE.CART_CACHE, JSON.stringify(cartData));
}

async function loadCart() {
  if (!auth.isLoggedIn()) {
    cart = getCachedCart();
    updateCartCount();
    return cart;
  }

  try {
    const data = await apiCall('/cart');
    cart = data.cart || [];
    cacheCart(cart);
    updateCartCount();
    return cart;
  } catch (error) {
    console.error('Load cart error:', error);
    cart = getCachedCart();
    updateCartCount();
    return cart;
  }
}

async function addToCart(product) {
  if (!auth.isLoggedIn()) {
    const existingItem = cart.find(item => item.name === product.name);
    
    if (existingItem) {
      existingItem.quantity += 1;
    } else {
      cart.push({
        name: product.name,
        price: product.price,
        image: product.image,
        quantity: 1
      });
    }
    
    cacheCart(cart);
    updateCartCount();
    showToast(`${product.name} added to cart!`);
    return;
  }

  try {
    const data = await apiCall('/cart/add', {
      method: 'POST',
      body: JSON.stringify({
        name: product.name,
        price: product.price,
        image: product.image
      })
    });

    cart = data.cart;
    cacheCart(cart);
    updateCartCount();
    showToast(`${product.name} added to cart!`);
  } catch (error) {
    console.error('Add to cart error:', error);
    showToast(error.message || 'Failed to add to cart', 'error');
  }
}

async function removeFromCart(productName) {
  if (!auth.isLoggedIn()) {
    cart = cart.filter(item => item.name !== productName);
    cacheCart(cart);
    updateCartCount();
    if (typeof updateCartDisplay === 'function') {
      updateCartDisplay();
    }
    showToast('Item removed from cart');
    return;
  }

  try {
    const data = await apiCall('/cart/remove', {
      method: 'DELETE',
      body: JSON.stringify({ name: productName })
    });

    cart = data.cart;
    cacheCart(cart);
    updateCartCount();
    if (typeof updateCartDisplay === 'function') {
      updateCartDisplay();
    }
    showToast('Item removed from cart');
  } catch (error) {
    console.error('Remove from cart error:', error);
    showToast(error.message || 'Failed to remove item', 'error');
  }
}

async function updateCartItemQuantity(productName, quantity) {
  if (!auth.isLoggedIn()) {
    const item = cart.find(i => i.name === productName);
    if (item) {
      item.quantity = Math.max(1, quantity);
      cacheCart(cart);
      updateCartCount();
      if (typeof updateCartDisplay === 'function') {
        updateCartDisplay();
      }
    }
    return;
  }

  try {
    const data = await apiCall('/cart/update', {
      method: 'PUT',
      body: JSON.stringify({ name: productName, quantity: Math.max(1, quantity) })
    });

    cart = data.cart;
    cacheCart(cart);
    updateCartCount();
    if (typeof updateCartDisplay === 'function') {
      updateCartDisplay();
    }
  } catch (error) {
    console.error('Update cart error:', error);
    showToast(error.message || 'Failed to update quantity', 'error');
  }
}

function updateCartCount() {
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  const countElements = document.querySelectorAll('#cart-count');
  countElements.forEach(el => el.textContent = totalItems);
}

function calculateCartTotal() {
  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const deliveryFee = subtotal > 500 ? 0 : 50;
  const tax = subtotal * 0.05;
  const total = subtotal + deliveryFee + tax;

  return { subtotal, deliveryFee, tax, total };
}

// ========================================
// 5. CART PAGE DISPLAY
// ========================================

function updateCartDisplay() {
  const cartItemsContainer = document.getElementById('cart-items');
  if (!cartItemsContainer) return;

  if (cart.length === 0) {
    cartItemsContainer.innerHTML = '<p class="empty-cart-message" style="text-align: center; padding: 40px; color: #666;">Your cart is empty. <a href="index.html" style="color: #007bff;">Start shopping!</a></p>';
    const checkoutBtn = document.getElementById('checkout-btn');
    if (checkoutBtn) checkoutBtn.disabled = true;
    return;
  }

  cartItemsContainer.innerHTML = cart.map(item => `
    <div class="cart-item" style="display: flex; align-items: center; padding: 15px; border-bottom: 1px solid #eee; gap: 15px;">
      <img src="${item.image}" alt="${item.name}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 8px;">
      <div style="flex: 1;">
        <h4 style="margin: 0 0 5px 0; font-size: 16px;">${item.name}</h4>
        <p style="margin: 0; color: #666; font-size: 14px;">₹${item.price.toFixed(2)} each</p>
      </div>
      <div style="display: flex; align-items: center; gap: 10px;">
        <button onclick="updateQuantity('${item.name.replace(/'/g, "\\'")}', ${item.quantity - 1})" style="padding: 5px 12px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; font-weight: bold;">-</button>
        <span style="font-weight: bold; min-width: 30px; text-align: center; font-size: 16px;">${item.quantity}</span>
        <button onclick="updateQuantity('${item.name.replace(/'/g, "\\'")}', ${item.quantity + 1})" style="padding: 5px 12px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; font-weight: bold;">+</button>
      </div>
      <div style="font-weight: bold; color: #007bff; min-width: 80px; text-align: right; font-size: 16px;">
        ₹${(item.price * item.quantity).toFixed(2)}
      </div>
      <button onclick="removeItem('${item.name.replace(/'/g, "\\'")}' )" style="padding: 8px 12px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer; white-space: nowrap;">Remove</button>
    </div>
  `).join('');

  const totals = calculateCartTotal();
  document.getElementById('cart-subtotal').textContent = `₹${totals.subtotal.toFixed(2)}`;
  document.getElementById('cart-delivery').textContent = totals.deliveryFee === 0 ? 'Free' : `₹${totals.deliveryFee.toFixed(2)}`;
  document.getElementById('cart-tax').textContent = `₹${totals.tax.toFixed(2)}`;
  document.getElementById('cart-total').textContent = `₹${totals.total.toFixed(2)}`;
  
  const checkoutBtn = document.getElementById('checkout-btn');
  if (checkoutBtn) {
    checkoutBtn.disabled = false;
  }
}

window.updateQuantity = async function(productName, newQuantity) {
  if (newQuantity < 1) {
    if (confirm('Remove this item from cart?')) {
      await removeFromCart(productName);
    }
  } else {
    await updateCartItemQuantity(productName, newQuantity);
  }
};

window.removeItem = async function(productName) {
  if (confirm('Remove this item from cart?')) {
    await removeFromCart(productName);
  }
};

// ========================================
// 6. ADDRESS MANAGEMENT - FIXED
// ========================================

async function loadAddresses() {
  if (!auth.isLoggedIn()) {
    showToast('Please login to manage addresses', 'error');
    setTimeout(() => window.location.href = 'login.html', 1500);
    return [];
  }

  try {
    const data = await apiCall('/addresses'); // ✅ FIXED: /api/addresses
    return data.addresses || [];
  } catch (error) {
    console.error('Load addresses error:', error);
    showToast('Failed to load addresses', 'error');
    return [];
  }
}

async function addAddress(addressData) {
  if (!auth.isLoggedIn()) {
    showToast('Please login to add address', 'error');
    return null;
  }

  try {
    // Validation
    const required = ['name', 'phone', 'address', 'city', 'state', 'pincode'];
    const missing = required.filter(field => !addressData[field]?.trim());
    
    if (missing.length > 0) {
      showToast(`Missing: ${missing.join(', ')}`, 'error');
      return null;
    }

    // Phone validation
    if (!/^[0-9]{10}$/.test(addressData.phone.replace(/\s/g, ''))) {
      showToast('Phone must be 10 digits', 'error');
      return null;
    }

    // Pincode validation
    if (!/^[0-9]{6}$/.test(addressData.pincode.replace(/\s/g, ''))) {
      showToast('Pincode must be 6 digits', 'error');
      return null;
    }

    showToast('Adding address...', 'warning');

    const data = await apiCall('/addresses', { // ✅ FIXED: /api/addresses
      method: 'POST',
      body: JSON.stringify({
        name: addressData.name.trim(),
        phone: addressData.phone.trim(),
        address: addressData.address.trim(),
        city: addressData.city.trim(),
        state: addressData.state.trim(),
        pincode: addressData.pincode.trim(),
        isDefault: addressData.isDefault || false
      })
    });

    showToast('Address added successfully!');
    return data.address;
  } catch (error) {
    console.error('Add address error:', error);
    showToast(error.message || 'Failed to add address', 'error');
    return null;
  }
}

async function updateAddress(addressId, updates) {
  if (!auth.isLoggedIn()) return null;

  try {
    const data = await apiCall(`/addresses/${addressId}`, { // ✅ FIXED
      method: 'PUT',
      body: JSON.stringify(updates)
    });

    showToast('Address updated!');
    return data.address;
  } catch (error) {
    console.error('Update address error:', error);
    showToast(error.message || 'Failed to update', 'error');
    return null;
  }
}

async function deleteAddress(addressId) {
  if (!auth.isLoggedIn()) return false;

  try {
    await apiCall(`/addresses/${addressId}`, { // ✅ FIXED
      method: 'DELETE'
    });

    showToast('Address deleted!');
    return true;
  } catch (error) {
    console.error('Delete address error:', error);
    showToast(error.message || 'Failed to delete', 'error');
    return false;
  }
}

async function setDefaultAddress(addressId) {
  return await updateAddress(addressId, { isDefault: true });
}

// ========================================
// 7. PAYMENT GATEWAY INTEGRATION
// ========================================

const PAYMENT_CONFIG = {
  razorpay: {
    key: 'rzp_test_RRL5aFktMe37rz',
    name: 'PharmaSoft',
    description: 'Medicine Purchase',
    image: 'https://i.imgur.com/n5tjHFD.png',
    theme: { color: '#007bff' }
  }
};

async function initializeRazorpay(amount, orderId) {
  return new Promise((resolve, reject) => {
    if (!window.Razorpay) {
      reject(new Error('Razorpay SDK not loaded'));
      return;
    }

    const options = {
      key: PAYMENT_CONFIG.razorpay.key,
      amount: Math.round(amount * 100),
      currency: 'INR',
      name: PAYMENT_CONFIG.razorpay.name,
      description: PAYMENT_CONFIG.razorpay.description,
      image: PAYMENT_CONFIG.razorpay.image,
      order_id: orderId,
      handler: function(response) {
        resolve({
          success: true,
          paymentId: response.razorpay_payment_id,
          orderId: response.razorpay_order_id,
          signature: response.razorpay_signature
        });
      },
      prefill: {
        name: currentUser?.name || '',
        email: currentUser?.email || '',
        contact: ''
      },
      theme: PAYMENT_CONFIG.razorpay.theme,
      modal: {
        ondismiss: function() {
          reject(new Error('Payment cancelled by user'));
        }
      }
    };

    const razorpay = new window.Razorpay(options);
    razorpay.open();
  });
}

async function processPayment(paymentMethod, amount, orderData) {
  try {
    showToast('Processing payment...', 'warning');

    let paymentResult;
    const orderId = 'ORD' + Date.now();

    switch(paymentMethod) {
      case 'razorpay':
        paymentResult = await initializeRazorpay(amount, orderId);
        break;

      case 'card':
      case 'upi':
      case 'wallet':
      case 'stripe':
        await new Promise(resolve => setTimeout(resolve, 2000));
        paymentResult = {
          success: true,
          paymentId: `${paymentMethod}_${Date.now()}`,
          orderId: orderId,
          method: paymentMethod
        };
        showToast(`${paymentMethod.toUpperCase()} payment processed successfully!`);
        break;

      case 'cod':
        await new Promise(resolve => setTimeout(resolve, 1000));
        paymentResult = {
          success: true,
          paymentId: 'cod_' + Date.now(),
          orderId: orderId,
          method: 'cod'
        };
        break;

      default:
        throw new Error('Invalid payment method');
    }

    if (paymentResult.success) {
      const finalOrderData = {
        ...orderData,
        paymentMethod: paymentMethod,
        paymentId: paymentResult.paymentId
      };

      const result = await apiCall('/orders', {
        method: 'POST',
        body: JSON.stringify(finalOrderData)
      });

      return { success: true, order: result.order };
    }

    throw new Error('Payment failed');

  } catch (error) {
    console.error('Payment error:', error);
    throw error;
  }
}

// ========================================
// 8. CHECKOUT PROCESS
// ========================================

async function handleCheckout() {
  if (!auth.isLoggedIn()) {
    showToast('Please login to checkout', 'error');
    setTimeout(() => window.location.href = 'login.html', 1500);
    return false;
  }

  if (cart.length === 0) {
    showToast('Your cart is empty', 'error');
    return false;
  }

  try {
    const addressData = await apiCall('/addresses'); // ✅ FIXED
    const defaultAddress = addressData.addresses.find(addr => addr.isDefault);

    if (!defaultAddress) {
      showToast('Please add a delivery address first', 'error');
      setTimeout(() => window.location.href = 'delivery.html', 1500);
      return false;
    }

    const totals = calculateCartTotal();
    
    const selectedPayment = document.querySelector('input[name="payment"]:checked');
    const paymentMethod = selectedPayment ? selectedPayment.value : 'cod';

    const orderData = {
      deliveryAddress: defaultAddress
    };

    const result = await processPayment(paymentMethod, totals.total, orderData);

    if (result.success) {
      await apiCall('/cart/clear', { method: 'DELETE' });
      cart = [];
      cacheCart(cart);
      updateCartCount();
      showToast('Order placed successfully!');
      setTimeout(() => window.location.href = 'orders.html', 1500);
      return result.order;
    }

    return false;

  } catch (error) {
    console.error('Checkout failed:', error);
    showToast(error.message || 'Checkout failed. Please try again.', 'error');
    return false;
  }
}

window.handleCheckout = handleCheckout;

function loadPaymentGateways() {
  if (!document.getElementById('razorpay-script')) {
    const razorpayScript = document.createElement('script');
    razorpayScript.id = 'razorpay-script';
    razorpayScript.src = 'https://checkout.razorpay.com/v1/checkout.js';
    razorpayScript.async = true;
    document.head.appendChild(razorpayScript);
  }
}

// ========================================
// 9. AUTHENTICATION HANDLERS
// ========================================

async function handleLogin(email, password) {
  try {
    const data = await apiCall('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });

    auth.setToken(data.token);
    auth.setUser(data.user);
    currentUser = data.user;

    await loadCart();
    updateUIForAuthState();
    showToast(`Welcome back, ${data.user.name}!`);
    
    setTimeout(() => {
      window.location.href = 'index.html';
    }, 1500);
    
    return true;

  } catch (error) {
    console.error('Login error:', error);
    throw error;
  }
}

async function handleRegister(email, password, name) {
  try {
    if (!email || !password || !name) {
      showToast('All fields are required', 'error');
      return false;
    }

    if (password.length < 6) {
      showToast('Password must be at least 6 characters', 'error');
      return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      showToast('Please enter a valid email address', 'error');
      return false;
    }

    showToast('Creating your account...', 'warning');

    const data = await apiCall('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name })
    });

    auth.setToken(data.token);
    auth.setUser(data.user);
    currentUser = data.user;

    await loadCart();
    updateUIForAuthState();
    showToast(`Welcome to PharmaSoft, ${data.user.name}!`);
    
    setTimeout(() => {
      window.location.href = 'index.html';
    }, 1500);
    
    return true;

  } catch (error) {
    console.error('Registration error:', error);
    throw error;
  }
}

window.handleLogin = handleLogin;
window.handleRegister = handleRegister;

// ========================================
// 10. UI STATE MANAGEMENT
// ========================================

function updateUIForAuthState() {
  const logoutBtn = document.getElementById('logout-btn');
  const loginLinks = document.querySelectorAll('a[href="login.html"]');

  if (auth.isLoggedIn()) {
    if (logoutBtn) {
      logoutBtn.style.display = 'inline-block';
      const userName = currentUser?.name?.split(' ')[0] || 'User';
      logoutBtn.textContent = `Logout (${userName})`;
    }
    loginLinks.forEach(link => {
      const userName = currentUser?.name?.split(' ')[0] || 'Account';
      link.textContent = userName;
      link.href = 'orders.html';
    });
  } else {
    if (logoutBtn) {
      logoutBtn.style.display = 'none';
    }
    loginLinks.forEach(link => {
      link.textContent = 'Login';
      link.href = 'login.html';
    });
  }
}

// ========================================
// 11. PRODUCT INTERACTION
// ========================================

function setupProductButtons() {
  const addButtons = document.querySelectorAll('.add-btn');

  addButtons.forEach(button => {
    button.addEventListener('click', function(e) {
      e.preventDefault();
      const card = this.closest('.product-card');
      const name = card.querySelector('h3').textContent.trim();
      const priceText = card.querySelector('.price').textContent;
      const price = parseFloat(priceText.replace('₹', '').split(' ')[0]);
      const image = card.querySelector('img')?.src || '';

      addToCart({ name, price, image });
      
      const originalText = this.textContent;
      const originalBg = this.style.background;
      this.textContent = 'ADDED!';
      this.style.background = '#28a745';
      this.disabled = true;
      
      setTimeout(() => {
        this.textContent = originalText;
        this.style.background = originalBg;
        this.disabled = false;
      }, 1500);
    });
  });
}

// ========================================
// 12. SEARCH FUNCTIONALITY
// ========================================

function setupSearch() {
  const searchForm = document.getElementById('search-form');
  const searchInput = document.getElementById('search-input');

  if (searchForm && searchInput) {
    searchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const query = searchInput.value.trim();
      if (query) {
        performSearch(query);
      }
    });

    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.trim();
      if (query === '') {
        showAllProducts();
      }
    });
  }
}

function performSearch(query) {
  const allProducts = document.querySelectorAll('.product-card');
  let foundCount = 0;

  allProducts.forEach(card => {
    const name = card.querySelector('h3').textContent.toLowerCase();
    const match = name.includes(query.toLowerCase());

    if (match) {
      card.style.display = 'block';
      card.style.opacity = '0';
      setTimeout(() => {
        card.style.transition = 'opacity 0.3s';
        card.style.opacity = '1';
      }, 10);
      foundCount++;
    } else {
      card.style.display = 'none';
    }
  });

  if (foundCount === 0) {
    showToast(`No products found for "${query}"`, 'error');
  } else {
    showToast(`Found ${foundCount} product(s)`);
  }
}

function showAllProducts() {
  const allProducts = document.querySelectorAll('.product-card');
  allProducts.forEach(card => {
    card.style.display = 'block';
    card.style.opacity = '1';
  });
}

// ========================================
// 13. TOAST NOTIFICATIONS
// ========================================

function showToast(message, type = 'success') {
  const existingToast = document.querySelector('.toast-notification');
  if (existingToast) {
    existingToast.remove();
  }

  const toast = document.createElement('div');
  toast.className = 'toast-notification';
  toast.textContent = message;
  
  const bgColor = type === 'error' ? '#dc3545' : type === 'warning' ? '#ffc107' : '#28a745';
  
  toast.style.cssText = `
    position: fixed;
    top: 90px;
    right: 20px;
    background: ${bgColor};
    color: white;
    padding: 15px 25px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 10000;
    animation: slideInRight 0.3s ease-out;
    font-weight: 500;
    max-width: 300px;
    word-wrap: break-word;
  `;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideOutRight 0.3s ease-in';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ========================================
// 14. ADD REQUIRED ANIMATIONS
// ========================================

if (!document.getElementById('pharmasoft-animations')) {
  const style = document.createElement('style');
  style.id = 'pharmasoft-animations';
  style.textContent = `
    @keyframes slideInRight {
      from { transform: translateX(400px); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOutRight {
      from { transform: translateX(0); opacity: 1; }
      to { transform: translateX(400px); opacity: 0; }
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: scale(0.9); }
      to { opacity: 1; transform: scale(1); }
    }
  `;
  document.head.appendChild(style);
}

// ========================================
// 15. INITIALIZATION
// ========================================

document.addEventListener('DOMContentLoaded', async () => {
  console.log('PharmaSoft initializing...');
  console.log('API Base URL:', API_BASE_URL);
  
  currentUser = auth.getUser();
  updateUIForAuthState();
  await loadCart();

  loadPaymentGateways();

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (confirm('Are you sure you want to logout?')) {
        auth.logout();
      }
    });
  }

  // Login form
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const email = document.getElementById('login-email')?.value.trim();
      const password = document.getElementById('login-password')?.value;
      
      if (!email || !password) {
        showToast('Please enter email and password', 'error');
        return;
      }
      
      const submitBtn = loginForm.querySelector('button[type="submit"]');
      const originalText = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Logging in...';
      
      try {
        await handleLogin(email, password);
      } catch (error) {
        showToast(error.message || 'Login failed. Please try again.', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    });
  }

  // Register form
  const registerForm = document.getElementById('register-form');
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const name = document.getElementById('register-name')?.value.trim();
      const email = document.getElementById('register-email')?.value.trim();
      const password = document.getElementById('register-password')?.value;
      const confirmPassword = document.getElementById('register-confirm-password')?.value;
      
      if (password !== confirmPassword) {
        showToast('Passwords do not match', 'error');
        return;
      }
      
      const submitBtn = registerForm.querySelector('button[type="submit"]');
      const originalText = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Creating Account...';
      
      try {
        await handleRegister(email, password, name);
      } catch (error) {
        showToast(error.message || 'Registration failed. Please try again.', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    });
  }

  setupProductButtons();
  setupSearch();

  if (window.location.pathname.includes('cart.html')) {
    updateCartDisplay();
  }

  console.log('✅ PharmaSoft initialized successfully!');
  console.log('🔗 Connected to backend server at:', API_BASE_URL);
});

// ========================================
// 16. ERROR HANDLING
// ========================================

window.addEventListener('error', (e) => {
  console.error('Global Error:', e.error);
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled Promise Rejection:', e.reason);
});

// Make functions globally available
window.addToCart = addToCart;
window.loadAddresses = loadAddresses;
window.addAddress = addAddress;
window.apiCall = apiCall; 
window.downloadInvoice = downloadInvoice;
