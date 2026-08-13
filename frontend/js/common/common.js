window.printOrderInvoice = async function (id, order) {
  if (!id) {
    showNotification("error", "No order loaded to print.");
    return;
  }

  try {
    const formatMoney = (m) => parseFloat(m || 0).toFixed(2);
    const formatDate = (d) => {
      if (!d) return "-";
      const date = new Date(d);
      return isNaN(date.getTime()) ? d : date.toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" });
    };

    const targetBranchId = order.branch_id || (order.branch && order.branch.id) || (window.globalState.user && window.globalState.user.branch_id) || 1;
    const branchName = GetBranchName(targetBranchId);
    const branchContact = GetBranchContact(targetBranchId);
    const branchContactAlt = GetBranchContactAlt(targetBranchId);
    const arabicBranchName = GetBranchArabicName(targetBranchId);
    const arabicBranchContact = GetBranchArabicContact(targetBranchId);
    const branchFawranCR = GetBranchFawranCR(targetBranchId);

    const itemsRows = order.items
      .map((item, index) => {
        const unitPrice = item.quantity > 0 ? item.subtotal / item.quantity : 0;
        return `
            <tr>
                <td style="text-align:center;">${index + 1}</td>
                <td class="description-cell" style="padding-left:6px; font-weight: 600; color: #1e293b;">${item.product_name}</td>
                <td style="text-align:center;">${item.quantity}</td>
                <td style="text-align:center;">${formatMoney(unitPrice)}</td>
                <td style="text-align:center; font-weight:600;">${formatMoney(item.subtotal)}</td>
            </tr>`;
      })
      .join("");

    const totalRowsNeeded = 5;
    let emptyRows = "";
    const currentCount = order.items.length;
    if (currentCount < totalRowsNeeded) {
      for (let i = currentCount; i < totalRowsNeeded; i++) {
        emptyRows += `<tr><td style="text-align:center;">${i + 1}</td><td></td><td></td><td></td><td></td></tr>`;
      }
    }

    const totalAmount = parseFloat(order.total_amount || 0);
    const receivedAmount = parseFloat(order.received_amount || 0);
    const dueAmount = totalAmount - receivedAmount;

    const formatCustomerMobile = (cust) => {
      if (!cust) return "";
      const rawMobile = cust.mobile || cust.customer_mobile || "";
      const rawCode = cust.country_code || cust.customer_country_code || "974";
      let cleanMobile = rawMobile.replace(/[^0-9]/g, "");
      let cleanCode = rawCode.replace(/[^0-9]/g, "") || "974";
      if (!cleanMobile) return "";
      if (cleanMobile.startsWith(cleanCode)) {
        cleanMobile = cleanMobile.slice(cleanCode.length);
      }
      cleanMobile = cleanMobile.replace(/^0+/, "");
      return `+${cleanCode} ${cleanMobile}`;
    };

    const generateSingleCard = () => `
      <div class="invoice-container">
          <div class="watermark">${branchName}</div>

          <header class="invoice-header">
              <div class="contact-info left">
                  <p>Mob: ${branchContact} | ${branchContactAlt}</p>
                  <p>Al Shafee St, Opp. Commercial Bank</p>
                  <p>New Rayyan, Doha - Qatar</p>
              </div>

              <div class="logo-name-section">
                  <h1>${branchName}</h1>
                  <h2>Abayat - Shelat - Hijabat - Naqabat &amp; Jalabia</h2>
                  <p>عبايات - شيلات - حجابات - نقابات و جلابيات</p>
                  <span class="arabic-logo">${arabicBranchName}</span>
              </div>

              <div class="contact-info right" style="text-align: right;">
                  <p>جوال: ${arabicBranchContact}</p>
                  <p>شارع الشافي، مقابل البنك التجاري</p>
                  <p>الريان الجديد، الدوحة - قطر</p>
                  <p style="font-weight: 800; font-size: 10.5px; margin-top: 2px; color: #000000; letter-spacing: 0.5px;">${branchFawranCR}</p>
              </div>
          </header>

          <div class="invoice-details">
              <div class="invoice-row">
                  <div class="no">No. ${order.memo_no || order.id}</div>
                  <div class="type">CASH / CREDIT INVOICE</div>
              </div>
          </div>

          <div class="info-grid">
              <div class="info-item">
                  <label>Delivery Date</label>
                  <input type="text" class="thin-line" value="${formatDate(order.delivery_date || order.order_date || order.created_at)}">
                  <label class="arabic-label">التاريخ التسليم</label>
              </div>
              <div class="info-item">
                  <label>Date</label>
                  <input type="text" class="thin-line" value="${formatDate(order.order_date || order.created_at)}">
                  <label class="arabic-label">التاريخ</label>
              </div>
              <div class="info-item full-width">
                  <label>Mr./Mrs.</label>
                  <input type="text" class="thin-line" value="${order.customer?.name || ""}">
                  <label class="arabic-label">السيد / السادة</label>
              </div>
              <div class="info-item full-width">
                  <label>Tel. Mobile</label>
                  <input type="text" class="thin-line" value="${formatCustomerMobile(order.customer)}">
                  <label class="arabic-label">تليفون / جوال</label>
              </div>
          </div>

          <table class="item-table">
              <thead>
                  <tr>
                      <th style="width: 8%;">Sr.No. الرقم</th>
                      <th style="width: 47%;">DESCRIPTION التفاصيل</th>
                      <th style="width: 10%;">QTY. الكمية</th>
                      <th style="width: 15%;">UNIT PRICE سعر الوحدة</th>
                      <th style="width: 20%;">AMOUNT المبلغ</th>
                  </tr>
              </thead>
              <tbody>
                  ${itemsRows}
                  ${emptyRows}

                  <tr class="total-row">
                      <td colspan="3" class="total-label-cell">TOTAL / المجموع</td>
                      <td colspan="2" class="total-amount-cell">${formatMoney(totalAmount)}</td>
                  </tr>
                  <tr class="total-row">
                      <td colspan="3" class="total-label-cell">ADVANCE / مقدماً</td>
                      <td colspan="2" class="total-amount-cell">${formatMoney(receivedAmount)}</td>
                  </tr>
                  <tr class="total-row final-total">
                      <td colspan="3" class="total-label-cell">BALANCE / الباقي</td>
                      <td colspan="2" class="total-amount-cell">${formatMoney(dueAmount)}</td>
                  </tr>
              </tbody>
          </table>

          <footer class="invoice-footer">
              <div class="signature">
                  <p>Receiver's Sign / توقيع المستلم</p>
                  <div class="signature-line"></div>
              </div>
              <div class="signature">
                  <p>Salesman's Sign / توقيع البائع</p>
                  <div class="signature-line"></div>
              </div>
          </footer>

          <div class="disclaimer-banner">
              We are not responsible. If you do not take the abaya within 3 months | لسنا مسؤولين. إذا لم تستلمي العباية خلال ٣ أشهر
          </div>
      </div>
    `;

    const printContent = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Invoice #${order.memo_no || order.id}</title>
                <style>
                    * { box-sizing: border-box; }
                    body {
                        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                        background-color: white;
                        margin: 0;
                        padding: 0;
                        color: #000000;
                    }
                    .page-wrapper {
                        width: 100%;
                        display: flex;
                        flex-direction: column;
                        gap: 2mm;
                    }
                    .cut-divider {
                        text-align: center;
                        font-size: 10px;
                        color: #64748b;
                        margin: 1mm 0;
                        user-select: none;
                        font-family: monospace;
                        font-weight: bold;
                    }
                    .invoice-container {
                        width: 100%;
                        height: 138mm;
                        background: white;
                        padding: 6px 12px;
                        border: 1.5px solid #334155;
                        font-size: 12.5px;
                        position: relative;
                        overflow: hidden;
                        box-sizing: border-box;
                        display: flex;
                        flex-direction: column;
                        justify-content: space-between;
                    }
                    .watermark {
                        position: absolute;
                        top: 50%;
                        left: 50%;
                        transform: translate(-50%, -50%) rotate(-30deg);
                        font-size: 64px;
                        font-weight: 700;
                        color: rgba(0, 0, 0, 0.04);
                        z-index: 0;
                        white-space: nowrap;
                        pointer-events: none;
                        text-transform: uppercase;
                    }
                    .invoice-header {
                        position: relative; z-index: 1;
                        display: flex; justify-content: space-between; align-items: flex-start;
                        border-bottom: 1.5px solid #475569;
                        padding-bottom: 2px; margin-bottom: 3px;
                    }
                    .contact-info p { margin: 0; line-height: 1.35; font-size: 12px; font-weight: 500; color: #0f172a; }
                    .logo-name-section { text-align: center; }
                    .logo-name-section h1 { font-size: 26px; color: #800000; margin: 0; font-weight: 700; line-height: 1.1; }
                    .logo-name-section h2 { font-size: 13px; margin: 1px 0 0 0; font-weight: 600; color: #0f172a; line-height: 1.1; }
                    .logo-name-section p { margin: 1px 0 0 0; font-size: 12px; font-weight: 500; color: #1e293b; }
                    .logo-name-section .arabic-logo {
                        border: 1px solid #475569; color: #0f172a;
                        padding: 1px 8px; display: inline-block; margin-top: 2px; border-radius: 3px; font-weight: 600; font-size: 12px;
                    }
                    .invoice-details { margin-bottom: 3px; position: relative; z-index: 1; }
                    .invoice-row { display: flex; justify-content: space-between; align-items: center; }
                    .invoice-row .no {
                        font-size: 15px; font-weight: 700; color: #000000;
                        padding: 2px 10px; border: 1.5px solid #334155;
                        background-color: #f8fafc; border-radius: 3px;
                    }
                    .invoice-row .type {
                        background: white; color: #0f172a; border: 1.5px solid #334155;
                        padding: 2px 10px; font-size: 13px; font-weight: 600; border-radius: 3px;
                    }
                    .info-grid {
                        position: relative; z-index: 1;
                        display: grid; grid-template-columns: repeat(2, 1fr);
                        gap: 2px 14px; font-size: 12.5px; margin-bottom: 3px;
                    }
                    .info-item { display: flex; align-items: center; gap: 4px; }
                    .info-item label { white-space: nowrap; font-weight: 600; color: #0f172a; min-width: 62px; font-size: 13px; }
                    .info-item .arabic-label { font-weight: 600; color: #1e293b; font-size: 12px; }
                    .info-item .thin-line {
                        flex-grow: 1; border: none; border-bottom: 1.5px dashed #475569;
                        padding: 0 4px; background: transparent; font-family: inherit;
                        font-size: 13.5px; color: #000000; font-weight: 600; height: 20px;
                    }
                    .info-item.full-width { grid-column: span 2; }
                    .item-table { position: relative; z-index: 1; width: 100%; border-collapse: collapse; font-size: 12.5px; margin-bottom: 3px; }
                    .item-table thead th {
                        background-color: #f1f5f9; color: #000000;
                        padding: 4px 3px; text-align: center; font-weight: 700;
                        border: 1.5px solid #334155; font-size: 12.5px; white-space: nowrap;
                    }
                    .item-table td { border: 1.5px solid #334155; height: 22px; padding: 1px 6px; vertical-align: middle; color: #000000; font-size: 12.5px; font-weight: 500; }
                    .total-row .total-label-cell, .total-row .total-amount-cell {
                        background-color: white; text-align: right; font-weight: 600; padding-right: 8px; border-color: #334155; color: #0f172a; font-size: 12.5px;
                    }
                    .total-row.final-total .total-label-cell { background-color: #f8fafc; color: #000000; font-weight: 700; font-size: 13.5px; }
                    .total-row.final-total .total-amount-cell { background-color: #f8fafc; color: #000000; font-size: 16px; font-weight: 700; }
                    .invoice-footer { position: relative; z-index: 1; display: flex; justify-content: space-between; margin-top: 3px; }
                    .invoice-footer .signature { width: 38%; text-align: center; }
                    .invoice-footer .signature-line { border-bottom: 1px solid #475569; height: 1px; margin-top: 14px; }
                    .invoice-footer p { font-weight: 600; color: #1e293b; font-size: 11.5px; margin: 0; }
                    .disclaimer-banner {
                        position: relative; z-index: 1; text-align: center; margin-top: 3px;
                        font-size: 10.5px; font-weight: 500; color: #1e293b;
                        border-top: 1px solid #94a3b8; padding-top: 2px;
                    }

                    @media print {
                        @page {
                            size: A4 portrait;
                            margin: 3mm 4mm;
                        }
                        body { background-color: white !important; padding: 0 !important; margin: 0 !important; }
                        .invoice-container { height: 138mm !important; page-break-inside: avoid !important; }
                        .item-table thead th { background-color: #f1f5f9 !important; -webkit-print-color-adjust: exact; }
                        .total-row.final-total td { background-color: #f8fafc !important; -webkit-print-color-adjust: exact; }
                        .watermark { color: rgba(0, 0, 0, 0.04) !important; -webkit-print-color-adjust: exact; }
                    }
                </style>
            </head>
            <body>
                <div class="page-wrapper">
                    ${generateSingleCard()}
                </div>
            </body>
            </html>
        `;

    // Remove existing iframe if any
    const oldFrame = document.getElementById("print-iframe");
    if (oldFrame) oldFrame.remove();

    // Create iframe
    const iframe = document.createElement("iframe");
    iframe.id = "print-iframe";
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";

    document.body.appendChild(iframe);

    const iframeDoc = iframe.contentWindow || iframe.contentDocument;
    const doc = iframeDoc.document || iframeDoc;

    // Write content
    doc.open();
    doc.write(printContent);
    doc.close();

    // Print after load
    iframe.onload = () => {
      setTimeout(() => {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();

        // Cleanup after printing
        setTimeout(() => iframe.remove(), 1000);
      }, 300);
    };
  } catch (error) {
    console.error("Print Error:", error);
    showNotification("error", "Failed to generate invoice.");
  }
};

window.printSaleInvoice = async function (id, sale) {
  if (!id) {
    showNotification("error", "No sale loaded to print.");
    return;
  }

  try {
    const formatMoney = (m) => parseFloat(m || 0).toFixed(2);
    const formatDate = (d) => {
      if (!d) return "-";
      const date = new Date(d);
      return isNaN(date.getTime()) ? d : date.toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" });
    };

    const targetBranchId = sale.branch_id || (sale.branch && sale.branch.id) || (window.globalState.user && window.globalState.user.branch_id) || 1;
    const branchName = GetBranchName(targetBranchId);
    const branchContact = GetBranchContact(targetBranchId);
    const branchContactAlt = GetBranchContactAlt(targetBranchId);
    const arabicBranchName = GetBranchArabicName(targetBranchId);
    const arabicBranchContact = GetBranchArabicContact(targetBranchId);
    const branchFawranCR = GetBranchFawranCR(targetBranchId);

    const itemsRows = sale.items
      .map((item, index) => {
        const unitPrice = item.quantity > 0 ? item.subtotal / item.quantity : 0;
        return `
            <tr>
                <td style="text-align:center;">${index + 1}</td>
                <td class="description-cell" style="padding-left:6px; font-weight: 600; color: #1e293b;">${item.product_name}</td>
                <td style="text-align:center;">${item.quantity}</td>
                <td style="text-align:center;">${formatMoney(unitPrice)}</td>
                <td style="text-align:center; font-weight:600;">${formatMoney(item.subtotal)}</td>
            </tr>`;
      })
      .join("");

    const totalRowsNeeded = 5;
    let emptyRows = "";
    const currentCount = sale.items.length;
    if (currentCount < totalRowsNeeded) {
      for (let i = currentCount; i < totalRowsNeeded; i++) {
        emptyRows += `<tr><td style="text-align:center;">${i + 1}</td><td></td><td></td><td></td><td></td></tr>`;
      }
    }

    const totalAmount = parseFloat(sale.total_amount || 0);
    const receivedAmount = parseFloat(sale.received_amount || 0);
    const dueAmount = totalAmount - receivedAmount;

    const generateSingleCard = () => `
      <div class="invoice-container">
          <div class="watermark">${branchName}</div>

          <header class="invoice-header">
              <div class="contact-info left">
                  <p>Mob: ${branchContact} | ${branchContactAlt}</p>
                  <p>Al Shafee St, Opp. Commercial Bank</p>
                  <p>New Rayyan, Doha - Qatar</p>
              </div>

              <div class="logo-name-section">
                  <h1>${branchName}</h1>
                  <h2>Abayat - Shelat - Hijabat - Naqabat &amp; Jalabia</h2>
                  <p>عبايات - شيلات - حجابات - نقابات و جلابيات</p>
                  <span class="arabic-logo">${arabicBranchName}</span>
              </div>

              <div class="contact-info right" style="text-align: right;">
                  <p>جوال: ${arabicBranchContact}</p>
                  <p>شارع الشافي، مقابل البنك التجاري</p>
                  <p>الريان الجديد، الدوحة - قطر</p>
                  <p style="font-weight: 800; font-size: 10.5px; margin-top: 2px; color: #000000; letter-spacing: 0.5px;">${branchFawranCR}</p>
              </div>
          </header>

          <div class="invoice-details">
              <div class="invoice-row">
                  <div class="no">No. ${sale.memo_no || sale.id}</div>
                  <div class="type">CASH / CREDIT INVOICE</div>
              </div>
          </div>

          <div class="info-grid">
              <div class="info-item">
                  <label>Delivery Date</label>
                  <input type="text" class="thin-line" value="${formatDate(sale.delivery_date || sale.sale_date || sale.created_at)}">
                  <label class="arabic-label">التاريخ التسليم</label>
              </div>
              <div class="info-item">
                  <label>Date</label>
                  <input type="text" class="thin-line" value="${formatDate(sale.sale_date || sale.created_at)}">
                  <label class="arabic-label">التاريخ</label>
              </div>
              <div class="info-item full-width">
                  <label>Mr./Mrs.</label>
                  <input type="text" class="thin-line" value="${sale.customer?.name || sale.customer_name || ""}">
                  <label class="arabic-label">السيد / السادة</label>
              </div>
              <div class="info-item full-width">
                  <label>Tel. Mobile</label>
                  <input type="text" class="thin-line" value="${sale.customer?.mobile || sale.customer_mobile || ""}">
                  <label class="arabic-label">تليفون / جوال</label>
              </div>
          </div>

          <table class="item-table">
              <thead>
                  <tr>
                      <th style="width: 8%;">Sr.No. الرقم</th>
                      <th style="width: 47%;">DESCRIPTION التفاصيل</th>
                      <th style="width: 10%;">QTY. الكمية</th>
                      <th style="width: 15%;">UNIT PRICE سعر الوحدة</th>
                      <th style="width: 20%;">AMOUNT المبلغ</th>
                  </tr>
              </thead>
              <tbody>
                  ${itemsRows}
                  ${emptyRows}

                  <tr class="total-row">
                      <td colspan="3" class="total-label-cell">TOTAL / المجموع</td>
                      <td colspan="2" class="total-amount-cell">${formatMoney(totalAmount)}</td>
                  </tr>
                  <tr class="total-row">
                      <td colspan="3" class="total-label-cell">RECEIVED / مقدماً</td>
                      <td colspan="2" class="total-amount-cell">${formatMoney(receivedAmount)}</td>
                  </tr>
                  <tr class="total-row final-total">
                      <td colspan="3" class="total-label-cell">BALANCE / الباقي</td>
                      <td colspan="2" class="total-amount-cell">${formatMoney(dueAmount)}</td>
                  </tr>
              </tbody>
          </table>

          <footer class="invoice-footer">
              <div class="signature">
                  <p>Receiver's Sign / توقيع المستلم</p>
                  <div class="signature-line"></div>
              </div>
              <div class="signature">
                  <p>Salesman's Sign / توقيع البائع</p>
                  <div class="signature-line"></div>
              </div>
          </footer>

          <div class="disclaimer-banner">
              We are not responsible. If you do not take the abaya within 3 months | لسنا مسؤولين. إذا لم تستلمي العباية خلال ٣ أشهر
          </div>
      </div>
    `;

    const printContent = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Invoice #${sale.memo_no || sale.id}</title>
                <style>
                    * { box-sizing: border-box; }
                    body {
                        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                        background-color: white;
                        margin: 0;
                        padding: 0;
                        color: #000000;
                    }
                    .page-wrapper {
                        width: 100%;
                        display: flex;
                        flex-direction: column;
                        gap: 2mm;
                    }
                    .cut-divider {
                        text-align: center;
                        font-size: 10px;
                        color: #64748b;
                        margin: 1mm 0;
                        user-select: none;
                        font-family: monospace;
                        font-weight: bold;
                    }
                    .invoice-container {
                        width: 100%;
                        height: 138mm;
                        background: white;
                        padding: 6px 12px;
                        border: 1.5px solid #334155;
                        font-size: 12.5px;
                        position: relative;
                        overflow: hidden;
                        box-sizing: border-box;
                        display: flex;
                        flex-direction: column;
                        justify-content: space-between;
                    }
                    .watermark {
                        position: absolute;
                        top: 50%;
                        left: 50%;
                        transform: translate(-50%, -50%) rotate(-30deg);
                        font-size: 64px;
                        font-weight: 700;
                        color: rgba(0, 0, 0, 0.04);
                        z-index: 0;
                        white-space: nowrap;
                        pointer-events: none;
                        text-transform: uppercase;
                    }
                    .invoice-header {
                        position: relative; z-index: 1;
                        display: flex; justify-content: space-between; align-items: flex-start;
                        border-bottom: 1.5px solid #475569;
                        padding-bottom: 2px; margin-bottom: 3px;
                    }
                    .contact-info p { margin: 0; line-height: 1.35; font-size: 12px; font-weight: 500; color: #0f172a; }
                    .logo-name-section { text-align: center; }
                    .logo-name-section h1 { font-size: 26px; color: #800000; margin: 0; font-weight: 700; line-height: 1.1; }
                    .logo-name-section h2 { font-size: 13px; margin: 1px 0 0 0; font-weight: 600; color: #0f172a; line-height: 1.1; }
                    .logo-name-section p { margin: 1px 0 0 0; font-size: 12px; font-weight: 500; color: #1e293b; }
                    .logo-name-section .arabic-logo {
                        border: 1px solid #475569; color: #0f172a;
                        padding: 1px 8px; display: inline-block; margin-top: 2px; border-radius: 3px; font-weight: 600; font-size: 12px;
                    }
                    .invoice-details { margin-bottom: 3px; position: relative; z-index: 1; }
                    .invoice-row { display: flex; justify-content: space-between; align-items: center; }
                    .invoice-row .no {
                        font-size: 15px; font-weight: 700; color: #000000;
                        padding: 2px 10px; border: 1.5px solid #334155;
                        background-color: #f8fafc; border-radius: 3px;
                    }
                    .invoice-row .type {
                        background: white; color: #0f172a; border: 1.5px solid #334155;
                        padding: 2px 10px; font-size: 13px; font-weight: 600; border-radius: 3px;
                    }
                    .info-grid {
                        position: relative; z-index: 1;
                        display: grid; grid-template-columns: repeat(2, 1fr);
                        gap: 2px 14px; font-size: 12.5px; margin-bottom: 3px;
                    }
                    .info-item { display: flex; align-items: center; gap: 4px; }
                    .info-item label { white-space: nowrap; font-weight: 600; color: #0f172a; min-width: 62px; font-size: 13px; }
                    .info-item .arabic-label { font-weight: 600; color: #1e293b; font-size: 12px; }
                    .info-item .thin-line {
                        flex-grow: 1; border: none; border-bottom: 1.5px dashed #475569;
                        padding: 0 4px; background: transparent; font-family: inherit;
                        font-size: 13.5px; color: #000000; font-weight: 600; height: 20px;
                    }
                    .info-item.full-width { grid-column: span 2; }
                    .item-table { position: relative; z-index: 1; width: 100%; border-collapse: collapse; font-size: 12.5px; margin-bottom: 3px; }
                    .item-table thead th {
                        background-color: #f1f5f9; color: #000000;
                        padding: 4px 3px; text-align: center; font-weight: 700;
                        border: 1.5px solid #334155; font-size: 12.5px; white-space: nowrap;
                    }
                    .item-table td { border: 1.5px solid #334155; height: 22px; padding: 1px 6px; vertical-align: middle; color: #000000; font-size: 12.5px; font-weight: 500; }
                    .total-row .total-label-cell, .total-row .total-amount-cell {
                        background-color: white; text-align: right; font-weight: 600; padding-right: 8px; border-color: #334155; color: #0f172a; font-size: 12.5px;
                    }
                    .total-row.final-total .total-label-cell { background-color: #f8fafc; color: #000000; font-weight: 700; font-size: 13.5px; }
                    .total-row.final-total .total-amount-cell { background-color: #f8fafc; color: #000000; font-size: 16px; font-weight: 700; }
                    .invoice-footer { position: relative; z-index: 1; display: flex; justify-content: space-between; margin-top: 3px; }
                    .invoice-footer .signature { width: 38%; text-align: center; }
                    .invoice-footer .signature-line { border-bottom: 1px solid #475569; height: 1px; margin-top: 14px; }
                    .invoice-footer p { font-weight: 600; color: #1e293b; font-size: 11.5px; margin: 0; }
                    .disclaimer-banner {
                        position: relative; z-index: 1; text-align: center; margin-top: 3px;
                        font-size: 10.5px; font-weight: 500; color: #1e293b;
                        border-top: 1px solid #94a3b8; padding-top: 2px;
                    }

                    @media print {
                        @page {
                            size: A4 portrait;
                            margin: 3mm 4mm;
                        }
                        body { background-color: white !important; padding: 0 !important; margin: 0 !important; }
                        .invoice-container { height: 138mm !important; page-break-inside: avoid !important; }
                        .item-table thead th { background-color: #f1f5f9 !important; -webkit-print-color-adjust: exact; }
                        .total-row.final-total td { background-color: #f8fafc !important; -webkit-print-color-adjust: exact; }
                        .watermark { color: rgba(0, 0, 0, 0.04) !important; -webkit-print-color-adjust: exact; }
                    }
                        .item-table thead th { background-color: #f1f5f9 !important; -webkit-print-color-adjust: exact; }
                        .total-row.final-total td { background-color: #f8fafc !important; -webkit-print-color-adjust: exact; }
                        .watermark { color: rgba(0, 0, 0, 0.04) !important; -webkit-print-color-adjust: exact; }
                    }
                </style>
            </head>
            <body>
                <div class="page-wrapper">
                    ${generateSingleCard()}
                </div>
            </body>
            </html>
        `;

    // Remove existing iframe if any
    const oldFrame = document.getElementById("print-iframe");
    if (oldFrame) oldFrame.remove();

    // Create iframe
    const iframe = document.createElement("iframe");
    iframe.id = "print-iframe";
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";

    document.body.appendChild(iframe);

    const iframeDoc = iframe.contentWindow || iframe.contentDocument;
    const doc = iframeDoc.document || iframeDoc;

    // Write content
    doc.open();
    doc.write(printContent);
    doc.close();

    // Print after load
    iframe.onload = () => {
      setTimeout(() => {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();

        // Cleanup after printing
        setTimeout(() => iframe.remove(), 1000);
      }, 300);
    };
  } catch (error) {
    console.error("Print Error:", error);
    showNotification("error", "Failed to generate invoice.");
  }
};

window.printReportGeneric = function ({
  header,
  columns,
  rows,
  totals = null,
}) {
  const todayStr = new Date().toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  const printContent = `
    <html>
    <head>
        <title>${header.reportTitle || "Report"}</title>
        <style>
            body {
                font-family: Arial, Helvetica, sans-serif;
                color: #111;
                padding: 28px;
            }

            .header {
                text-align: center;
                border-bottom: 2px solid #333;
                padding-bottom: 12px;
                margin-bottom: 22px;
            }

            .company {
                font-size: 22px;
                font-weight: bold;
            }

            .title {
                font-size: 14px;
                margin-top: 4px;
                color: #444;
            }

            .meta {
                display: flex;
                justify-content: space-between;
                font-size: 12px;
                margin-bottom: 16px;
            }

            table {
                width: 100%;
                border-collapse: collapse;
                font-size: 13px;
            }

            th, td {
                border: 1px solid #444;
                padding: 6px;
            }

            th {
                background: #f2f2f2;
                text-transform: uppercase;
                font-size: 11px;
            }

            td {
                text-align: right;
            }

            tfoot td {
                font-weight: bold;
                background: #f9f9f9;
            }

            .footer {
                margin-top: 30px;
                text-align: center;
                font-size: 11px;
                color: #555;
            }

            @media print {
                body { padding: 0; }
            }
        </style>
    </head>

    <body>

        <!-- HEADER -->
        <div class="header">
            <div class="company">${header.companyName}</div>
            <div class="title">${header.reportTitle}</div>
        </div>

        <!-- META -->
        <div class="meta">
            <div>
                ${header.branchName ? `<strong>Branch:</strong> ${header.branchName}<br>` : ""}
                ${header.startDate === "" || header.endDate === "" ? "" : ` <strong>Period:</strong> ${header.startDate} - ${header.endDate}`}
            </div>
            <div>
                <strong>Print Date:</strong> ${todayStr}
            </div>
        </div>

        <!-- TABLE -->
        <table>
            <thead>
                <tr>
                    ${columns
                      .map(
                        (col) =>
                          `<th style="text-align:${col.align || "right"}">${col.label}</th>`,
                      )
                      .join("")}
                </tr>
            </thead>

            <tbody>
                ${rows
                  .map(
                    (row) => `
                    <tr>
                        ${columns
                          .map(
                            (col) => `
                            <td style="text-align:${col.align || "right"}">
                                ${row[col.key] ?? "-"}
                            </td>
                        `,
                          )
                          .join("")}
                    </tr>
                `,
                  )
                  .join("")}
            </tbody>

            ${
              totals
                ? `
            <tfoot>
                <tr>
                    ${columns
                      .map(
                        (col) => `
                        <td>${totals[col.key] ?? ""}</td>
                    `,
                      )
                      .join("")}
                </tr>
            </tfoot>`
                : ""
            }
        </table>

        <div class="footer">
            This is a system generated report. No signature required.
        </div>

    </body>
    </html>
    `;
  // Remove existing iframe if any
  const oldFrame = document.getElementById("print-report-iframe");
  if (oldFrame) oldFrame.remove();

  // Create iframe
  const iframe = document.createElement("iframe");
  iframe.id = "print-report-iframe";
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";

  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentWindow || iframe.contentDocument;
  const doc = iframeDoc.document || iframeDoc;

  // Write content
  doc.open();
  doc.write(printContent);
  doc.close();

  // Print after load
  iframe.onload = () => {
    setTimeout(() => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();

      // Cleanup after printing
      setTimeout(() => iframe.remove(), 1000);
    }, 300);
  };
};

window.formatDate = (date) => {
  if (!date) return "-";
  const dateObj = new Date(date);
  if (isNaN(dateObj.getTime())) return "-";

  // Define short month names manually
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  // Manually construct the date string (DD-MMM-YYYY)
  const day = String(dateObj.getDate()).padStart(2, "0");
  const month = monthNames[dateObj.getMonth()]; // getMonth() is 0-indexed
  const year = dateObj.getFullYear();

  return `${day} ${month} ${year}`;
};

window.sendWhatsAppInvoice = async function (type, itemOrId) {
  try {
    window.showActionSpinner && window.showActionSpinner("Preparing WhatsApp invoice...");
    let item = itemOrId;
    if (typeof itemOrId === "number" || typeof itemOrId === "string") {
      const apiBase = window.globalState ? window.globalState.apiBase : "http://localhost:8080/api/v1";
      const endpoint = type === "sale" 
        ? `${apiBase}/products/sales/details/${itemOrId}` 
        : `${apiBase}/products/orders/${itemOrId}`;
      const res = await fetch(endpoint, {
        headers: window.getAuthHeaders ? window.getAuthHeaders() : {},
      });
      const data = await res.json();
      if (data.error || (!data.order && !data.sale && !data.data)) {
        if (window.showNotification) window.showNotification("error", "Could not fetch invoice details.");
        window.hideActionSpinner && window.hideActionSpinner();
        return;
      }
      item = data.order || data.sale || data.data;
    }
    window.hideActionSpinner && window.hideActionSpinner();

    const customer = item.customer || item.Customer || {};
    const rawMobile = customer.mobile || item.customer_mobile || item.mobile || "";
    const rawCountryCode = customer.country_code || item.country_code || item.customer_country_code || "974";

    if (!rawMobile) {
      if (window.showNotification) window.showNotification("error", "Customer mobile number not found.");
      return;
    }

    // Clean mobile and country code (strip non-digits)
    let cleanMobile = rawMobile.replace(/[^0-9]/g, "");
    let cleanCountryCode = rawCountryCode.replace(/[^0-9]/g, "") || "974";

    // If mobile starts with country code already, don't duplicate it
    if (cleanMobile.startsWith(cleanCountryCode)) {
      // already includes country code
    } else {
      // Remove leading zero if present (e.g. 055016898 -> 55016898)
      cleanMobile = cleanMobile.replace(/^0+/, "");
      cleanMobile = cleanCountryCode + cleanMobile;
    }

    const targetBranchId = item.branch_id || (item.branch && item.branch.id) || (window.globalState.user && window.globalState.user.branch_id) || 1;
    const branchName = GetBranchName(targetBranchId);
    const branchContact = GetBranchContact(targetBranchId);
    const companyAddress = "Al Shafee St, Opp. Commercial Bank, New Rayyan, Doha - Qatar";

    const origin = window.location.origin;
    const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    const invoicePath = isLocalhost ? "/frontend/public_invoice.html" : "/public_invoice.html";
    const memoNo = item.memo_no || item.id;
    const cleanMemoNo = String(memoNo).replace(/^INV-/, "");
    const invoiceUrl = `${origin}${invoicePath}?type=${type}&memo_no=${encodeURIComponent(cleanMemoNo)}`;
    const total = Number(item.total_amount || 0).toFixed(2);
    
    const msg = `*Dear valued customer*
Thank you for shopping at *${branchName}*! Your invoice is ready.

*View & Download Invoice:*
${invoiceUrl}

*${branchName}*
*Contact:* ${branchContact}
*Address:* ${companyAddress}`;

    const waUrl = `https://wa.me/${cleanMobile}?text=${encodeURIComponent(msg)}`;

    window.open(waUrl, "_blank");
  } catch (e) {
    window.hideActionSpinner && window.hideActionSpinner();
    console.error("sendWhatsAppInvoice error:", e);
    if (window.showNotification) window.showNotification("error", "Failed to send WhatsApp invoice.");
  }
};

/* --- SPINNER PRELOADER OVERLAY HELPER --- */
window.showActionSpinner = function (msg = "Loading details...") {
  let spinner = document.getElementById("globalActionSpinner");
  if (!spinner) {
    spinner = document.createElement("div");
    spinner.id = "globalActionSpinner";
    spinner.className =
      "fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-xs flex flex-col items-center justify-center transition-opacity duration-200 opacity-0 pointer-events-none";
    document.body.appendChild(spinner);
  }

  spinner.innerHTML = `
    <div class="bg-white rounded-2xl shadow-2xl border border-slate-100 flex flex-col items-center justify-center gap-4 transform scale-95 transition-all duration-200" id="spinnerCard" style="padding: 28px 48px !important; min-width: 260px !important;">
      <div class="flex items-center justify-center text-brand-600">
        <i class="ph ph-spinner-gap text-4xl animate-spin"></i>
      </div>
      <span id="spinnerText" class="text-xs font-bold text-slate-700 tracking-wide text-center whitespace-nowrap">${msg}</span>
    </div>
  `;

  spinner.classList.remove("hidden", "pointer-events-none", "opacity-0");
  spinner.classList.add("opacity-100");
  const card = spinner.querySelector("#spinnerCard");
  if (card) {
    card.classList.remove("scale-95");
    card.classList.add("scale-100");
  }
};

window.hideActionSpinner = function () {
  const spinner = document.getElementById("globalActionSpinner");
  if (!spinner) return;
  spinner.classList.remove("opacity-100");
  spinner.classList.add("opacity-0", "pointer-events-none");
  setTimeout(() => {
    spinner.classList.add("hidden");
  }, 200);
};

/* --- ANIMATED MODAL HELPERS --- */
window.openModalAnimated = function (modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.classList.remove("hidden");

  const backdrop = modal.querySelector(".backdrop-blur-sm, .bg-slate-900\\/60, .fixed.inset-0");
  const card = modal.querySelector(".bg-white");

  if (backdrop) {
    backdrop.classList.add("transition-opacity", "duration-300");
    backdrop.style.opacity = "0";
    setTimeout(() => { backdrop.style.opacity = "1"; }, 10);
  }
  if (card) {
    card.classList.add("transition-all", "duration-300", "transform");
    card.style.opacity = "0";
    card.style.transform = "scale(0.95)";
    setTimeout(() => {
      card.style.opacity = "1";
      card.style.transform = "scale(1)";
    }, 10);
  }
};

window.closeModalAnimated = function (modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;

  const backdrop = modal.querySelector(".backdrop-blur-sm, .bg-slate-900\\/60, .fixed.inset-0");
  const card = modal.querySelector(".bg-white");

  if (backdrop) {
    backdrop.style.opacity = "0";
  }
  if (card) {
    card.style.opacity = "0";
    card.style.transform = "scale(0.95)";
  }

  setTimeout(() => {
    modal.classList.add("hidden");
    if (backdrop) backdrop.style.opacity = "";
    if (card) {
      card.style.opacity = "";
      card.style.transform = "";
    }
  }, 280);
};

/* --- TABLE ACTION MENU HELPER --- */
window.toggleActionMenu = function (e, menuId) {
  if (e) e.stopPropagation();
  const menu = document.getElementById(menuId);
  if (!menu) return;
  const isHidden = menu.classList.contains("hidden");
  const btn = (e && (e.currentTarget || (e.target && e.target.closest(".action-menu-btn"))));

  window.closeAllActionMenus();

  if (isHidden) {
    menu.classList.remove("hidden");
    const tr = menu.closest("tr");
    if (tr) {
      tr.style.zIndex = "99";
      tr.style.position = "relative";
    }
    if (btn) {
      btn.classList.add("bg-slate-900", "text-white", "border-slate-900");
      btn.classList.remove("bg-slate-100", "text-slate-800");
    }
  }
};

window.closeAllActionMenus = function () {
  const menus = document.querySelectorAll(".action-menu-dropdown");
  menus.forEach((m) => {
    m.classList.add("hidden");
    const tr = m.closest("tr");
    if (tr) {
      tr.style.zIndex = "";
      tr.style.position = "";
    }
  });

  const btns = document.querySelectorAll(".action-menu-btn");
  btns.forEach((btn) => {
    btn.classList.remove("bg-slate-900", "text-white", "border-slate-900");
    btn.classList.add("bg-slate-100", "text-slate-800");
  });
};

document.addEventListener("click", (e) => {
  if (!e.target.closest(".action-menu-btn") && !e.target.closest(".action-menu-dropdown")) {
    window.closeAllActionMenus();
  }
});
