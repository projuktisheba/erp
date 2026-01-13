window.printOrderInvoice = async function(id, order) {
    if (!id) {
        showNotification("error", "No order loaded to print.");
        return;
    }

    try {
        const formatMoney = (m) => parseFloat(m || 0).toFixed(2);

        // Watermark Logic: Try order branch, global branch, or fallback
        const branchName = GetBranchName();

        // Generate Items Rows
        const itemsRows = order.items.map((item, index) => {
            const unitPrice = item.quantity > 0 ? (item.subtotal / item.quantity) : 0;
            return `
            <tr>
                <td style="text-align:center;">${index + 1}</td>
                <td class="description-cell" style="padding-left:8px;">${item.product_name}</td>
                <td style="text-align:center;">${item.quantity}</td>
                <td style="text-align:center;">${formatMoney(unitPrice)}</td>
                <td style="text-align:center; font-weight:600;">${formatMoney(item.subtotal)}</td>
            </tr>`;
        }).join("");

        // Fill Empty Rows
        const totalRowsNeeded = 10;
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

        const printContent = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Invoice #${order.memo_no}</title>
                <style>
                    /* --- LIGHTWEIGHT THEME (Slate & Silver) --- */
                    body {
                        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                        background-color: #f8fafc;
                        display: flex;
                        justify-content: center;
                        padding: 20px;
                        color: #334155; /* Slate 700 - Soft Dark */
                    }

                    .invoice-container {
                        width: 700px;
                        background: white;
                        padding: 30px;
                        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
                        border: 1px solid #e2e8f0;
                        font-size: 13px;
                        position: relative;
                        overflow: hidden; /* Clips the watermark */
                    }

                    /* WATERMARK */
                    .watermark {
                        position: absolute;
                        top: 50%;
                        left: 50%;
                        transform: translate(-50%, -50%) rotate(-45deg);
                        font-size: 80px;
                        font-weight: 900;
                        color: rgba(148, 163, 184, 0.1); /* Very faint slate */
                        z-index: 0;
                        white-space: nowrap;
                        pointer-events: none;
                        text-transform: uppercase;
                        user-select: none;
                    }

                    /* Header */
                    .invoice-header {
                        position: relative; z-index: 1;
                        display: flex; justify-content: space-between; align-items: flex-start;
                        border-bottom: 2px solid #88929e; /* Light Silver Border */
                        padding-bottom: 15px; margin-bottom: 20px;
                    }
                    .contact-info p { margin: 2px 0; line-height: 1.4; font-size: 11px; color: #64748b; }

                    .logo-name-section { text-align: center; }
                    .logo-name-section h1 { font-size: 26px; color: #334155; margin: 0 0 5px 0; font-weight: 700; }
                    .logo-name-section p { margin: 0; font-size: 12px; font-weight: 500; color: #475569;}
                    .logo-name-section .arabic-logo {
                        border: 1px solid #94a3b8; color: #475569;
                        padding: 2px 12px; display: inline-block; margin-top: 5px; border-radius: 4px;
                    }

                    /* Details Row */
                    .invoice-details { margin-bottom: 20px; position: relative; z-index: 1; }
                    .invoice-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }

                    /* Invoice No - Minimalist */
                    .invoice-row .no {
                        font-size: 16px; font-weight: bold; color: #334155;
                        padding: 5px 12px; border: 1px solid #94a3b8;
                        background-color: #f8fafc; border-radius: 4px;
                    }
                    .invoice-row .type {
                        background: white; color: #475569; border: 1px solid #88929e;
                        padding: 5px 15px; font-size: 12px; font-weight: 600; border-radius: 4px;
                    }

                    /* Inputs */
                    .info-grid { position: relative; z-index: 1; display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px 30px; font-size: 13px; margin-bottom: 20px; }
                    .info-item { display: flex; align-items: center; gap: 10px; }
                    .info-item label { white-space: nowrap; font-weight: 700; color: #475569; min-width: 60px; }
                    .info-item .thin-line {
                        flex-grow: 1; border: none; border-bottom: 1px dashed #88929e; /* Light dashed line */
                        padding: 2px 5px; background: transparent; font-family: inherit;
                        font-size: 13px; color: #1e293b; font-weight: 600;
                    }
                    .info-item.full-width { grid-column: span 2; }

                    /* Table - Lightweight */
                    .item-table { position: relative; z-index: 1; width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 20px; }

                    /* Header: Light Gray BG, Dark Text */
                    .item-table thead th {
                        background-color: #f1f5f9; color: #334155;
                        padding: 10px 5px; text-align: center; font-weight: 700;
                        border: 1px solid #88929e;
                    }

                    .item-table td { border: 1px solid #88929e; height: 28px; padding: 0 5px; vertical-align: middle; color: #334155; }

                    /* Totals - Clean */
                    .total-row .total-label-cell, .total-row .total-amount-cell {
                        background-color: white; text-align: right; font-weight: 600; padding-right: 10px; border-color: #88929e; color: #475569;
                    }

                    .total-row.final-total .total-label-cell { background-color: #f8fafc; color: #0f172a; font-weight: 600; }
                    .total-row.final-total .total-amount-cell { background-color: #f8fafc; color: #0f172a; font-size: 14px; font-weight: 600; }

                    /* Footer */
                    .invoice-footer { position: relative; z-index: 1; display: flex; justify-content: space-between; margin-top: 40px; }
                    .invoice-footer .signature { width: 40%; text-align: center; }
                    .invoice-footer .signature-line { border-bottom: 1px solid #94a3b8; height: 1px; margin-top: 30px; }
                    .invoice-footer p { font-weight: 600; color: #64748b; font-size: 12px; }

                    /* PRINT OVERRIDES */
                    @media print {
                        body { background-color: white !important; margin: 0; }
                        .invoice-container { width: 100%; box-shadow: none; border: none; padding: 0; }

                        /* Force background colors */
                        .item-table thead th { background-color: #f1f5f9 !important; -webkit-print-color-adjust: exact; }
                        .total-row.final-total td { background-color: #f8fafc !important; -webkit-print-color-adjust: exact; }

                        /* Ensure watermark prints but stays faint */
                        .watermark { color: rgba(0, 0, 0, 0.05) !important; -webkit-print-color-adjust: exact; }
                    }
                </style>
            </head>
            <body>
                <div class="invoice-container">

                    <div class="watermark">${branchName}</div>

                    <header class="invoice-header">
                        <div class="contact-info left">
                            <p>Mob: 50294046 | Mob: 50298321</p>
                            <p>Al Shafee Street</p>
                            <p>Opp. Commercial Bank</p>
                            <p>New Rayyan</p>
                            <p>Doha - Qatar</p>
                        </div>

                        <div class="logo-name-section">
                            <h1 style="color:#800000; font-size:28px; margin-bottom:5px;">${branchName}</h1>
                            <h2 style="font-size:12px; margin:0; font-weight:normal;">
                            Abayat - Shelat - Hijabat - Niqabat &amp; Jalabia
                            </h2>
                            <p>عبايات - شيلات - حجابات - نقابات و جلابيات</p>
                            <p class="arabic-logo">(يوم العبايات)</p>
                        </div>

                        <div class="contact-info right" style="text-align: right;">
                            <p>جوال: ٥٠٢٩٤٠٤٦@</p>
                            <p>جوال: ٥٠٢٩٨٣٢١@</p>
                            <p>شارع الشافي</p>
                            <p>مقابل البنك التجاري</p>
                            <p>الريان الجديد</p>
                            <p>الدوحة - قطر</p>
                        </div>
                    </header>

                    <div class="invoice-details">
                        <div class="invoice-row">
                            <div class="no">No. ${order.memo_no}</div>
                            <div class="type">CASH / CREDIT INVOICE</div>
                        </div>
                    </div>

                    <div class="info-grid">
                        <div class="info-item">
                            <label>Delivery Date</label>
                            <input type="text" class="thin-line" value="${formatDate(order.delivery_date)}">
                            <label class="arabic-label">التاريخ التسليم</label>
                        </div>
                        <div class="info-item">
                            <label>Date</label>
                            <input type="text" class="thin-line" value="${formatDate(order.order_date)}">
                            <label class="arabic-label">التاريخ</label>
                        </div>
                        <div class="info-item full-width">
                            <label>Mr./Messrs</label>
                            <input type="text" class="thin-line" value="${order.customer?.name || ''}">
                            <label class="arabic-label">السيد / السادة</label>
                        </div>
                        <div class="info-item full-width">
                            <label>Tel. Mobile</label>
                            <input type="text" class="thin-line" value="${order.customer?.mobile || ''}">
                            <label class="arabic-label">تليفون / جوال</label>
                        </div>
                    </div>

                    <table class="item-table">
                        <thead>
                            <tr>
                                <th style="width: 8%;"><span class="en">Sr.No.</span><br><span class="ar text-[10px]">الرقم</span></th>
                                <th style="width: 47%;"><span class="en">DESCRIPTION</span><br><span class="ar text-[10px]">التفاصيل</span></th>
                                <th style="width: 10%;"><span class="en">QTY.</span><br><span class="ar text-[10px]">الكمية</span></th>
                                <th style="width: 15%;"><span class="en">UNIT PRICE</span><br><span class="ar text-[10px]">سعر الوحدة</span></th>
                                <th style="width: 20%;"><span class="en">AMOUNT</span><br><span class="ar text-[10px]">المبلغ</span></th>
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
                             <tr class="total-row">
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
                </div>
            </body>
            </html>
        `;

    // Remove existing iframe if any
    const oldFrame = document.getElementById('print-iframe');
    if (oldFrame) oldFrame.remove();

    // Create iframe
    const iframe = document.createElement('iframe');
    iframe.id = 'print-iframe';
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';

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

window.printReportGeneric = function ({ header, columns, rows, totals = null }) {
    const todayStr = new Date().toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric'
    });

    const printContent = `
    <html>
    <head>
        <title>${header.reportTitle || 'Report'}</title>
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
                ${header.branchName ? `<strong>Branch:</strong> ${header.branchName}<br>` : ''}
                ${header.startDate === "" || header.endDate === "" ? '': ` <strong>Period:</strong> ${header.startDate} - ${header.endDate}`}
            </div>
            <div>
                <strong>Print Date:</strong> ${todayStr}
            </div>
        </div>

        <!-- TABLE -->
        <table>
            <thead>
                <tr>
                    ${columns.map(col =>
                        `<th style="text-align:${col.align || 'right'}">${col.label}</th>`
                    ).join('')}
                </tr>
            </thead>

            <tbody>
                ${rows.map(row => `
                    <tr>
                        ${columns.map(col => `
                            <td style="text-align:${col.align || 'right'}">
                                ${row[col.key] ?? '-'}
                            </td>
                        `).join('')}
                    </tr>
                `).join('')}
            </tbody>

            ${totals ? `
            <tfoot>
                <tr>
                    ${columns.map(col => `
                        <td>${totals[col.key] ?? ''}</td>
                    `).join('')}
                </tr>
            </tfoot>` : ''}
        </table>

        <div class="footer">
            This is a system generated report. No signature required.
        </div>

    </body>
    </html>
    `
    // Remove existing iframe if any
    const oldFrame = document.getElementById('print-report-iframe');
    if (oldFrame) oldFrame.remove();

    // Create iframe
    const iframe = document.createElement('iframe');
    iframe.id = 'print-report-iframe';
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';

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


window.formatDate = (date)=>{
    const dateObj = new Date(date);
  
  // Define short month names manually
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  
  // Manually construct the date string (DD-MMM-YYYY)
  const day = String(dateObj.getDate()).padStart(2, '0');
  const month = monthNames[dateObj.getMonth()]; // getMonth() is 0-indexed
  const year = dateObj.getFullYear();
  
  return `${day} ${month} ${year}`;
}