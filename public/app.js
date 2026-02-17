const promptForm = document.getElementById("prompt-form");
const temperatureSlider = document.getElementById("temperature");
const temperatureValue = document.getElementById("temperature-value");
const resultBox = document.getElementById("result-box");
const formMessage = document.getElementById("form-message");

temperatureSlider.addEventListener("input", (event) => {
  const value = Number(event.target.value).toFixed(1);
  temperatureValue.textContent = value;
});

promptForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const userInput = document.getElementById("user-input").value.trim();

  if (!userInput) {
    formMessage.textContent = "Please enter a user request before submitting.";
    return;
  }

  formMessage.textContent = "UI ready. Prompt wrapper call is enabled in the next commit.";
  resultBox.textContent =
    "Frontend fields validated successfully. API call wiring follows in milestone 4.";
});
