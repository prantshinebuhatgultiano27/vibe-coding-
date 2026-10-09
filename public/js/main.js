// Shared Helper Functions for Formatting and UI feedback

function formatPeso(amount) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2
  }).format(amount);
}

function formatDate(dateString) {
  if (!dateString) return "";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}

function formatTime(timeString) {
  if (!timeString) return "";
  const [hours, minutes] = timeString.split(":");
  let h = parseInt(hours, 10);
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${minutes} ${ampm}`;
}

function showBanner(message, isError = true) {
  const banner = document.getElementById("message-banner");
  if (!banner) return;
  banner.textContent = message;
  banner.className = isError ? "banner banner-error" : "banner banner-success";
  banner.style.display = "block";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function clearBanner() {
  const banner = document.getElementById("message-banner");
  if (banner) {
    banner.style.display = "none";
    banner.textContent = "";
  }
}

function setFieldValidation(inputEl, isValid, message = "") {
  const parent = inputEl.closest(".form-group");
  if (!parent) return;
  
  const errorEl = parent.querySelector(".error-text");
  if (isValid) {
    parent.classList.remove("has-error");
    if (errorEl) errorEl.textContent = "";
  } else {
    parent.classList.add("has-error");
    if (errorEl) errorEl.textContent = message;
  }
}