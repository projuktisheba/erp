window.formatMoney = (amount)=>{
  if (!amount && amount !== 0) return "-";
  // Returns string like "1,200.50"
  return parseFloat(amount).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}