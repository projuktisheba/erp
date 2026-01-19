window.formatMoney = (amount)=>{
  if (!amount && amount !== 0) return "-";
  // Returns string like "1,200.50"
  return parseFloat(amount).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}


window.formatDateVal = (date)=> {
  const d = new Date(date);
  // Handle timezone offset issues by using local string split
  const offset = d.getTimezoneOffset();
  const adjustedDate = new Date(d.getTime() - offset * 60 * 1000);
  return adjustedDate.toISOString().split("T")[0];
}