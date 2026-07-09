const generateButton = document.getElementById("generate");
const copyButton = document.getElementById("copy");
const output = document.getElementById("output");

generateButton.addEventListener("click", async () => {
  const formData = new FormData();

  formData.append("client", document.getElementById("client").value);
  formData.append("title", document.getElementById("title").value);
  formData.append("folder", document.getElementById("folder").value);
  formData.append("border", document.getElementById("border").value);
  formData.append("credits", document.getElementById("credits").value);

  const files = document.getElementById("files").files;

  for (const file of files) {
    formData.append("files", file);
  }

  output.value = "Creating campaign...";

  const response = await fetch("/api/create-campaign", {
    method: "POST",
    body: formData
  });

  const result = await response.json();

  if (!result.success) {
    output.value = "ERROR: " + result.error;
    return;
  }

  output.value = result.code;
});

copyButton.addEventListener("click", () => {
  output.select();
  document.execCommand("copy");
});