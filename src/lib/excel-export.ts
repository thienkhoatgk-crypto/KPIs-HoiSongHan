import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { format } from 'date-fns';
import { UserProfile, KPIReport, KPISettings } from '../types';
import { calculateMonthlyScore, formatWeekDisplay, isBeforeMeetingTime } from './kpi';

// Helper to load logo
async function getLogoId(workbook: ExcelJS.Workbook): Promise<number | null> {
  try {
    const response = await fetch('/favicon.png');
    const buffer = await response.arrayBuffer();
    return workbook.addImage({
      buffer: buffer,
      extension: 'png',
    });
  } catch (error) {
    console.warn('Could not load logo for Excel', error);
    return null;
  }
}

export async function exportIndividualExcel(
  user: UserProfile,
  userReports: KPIReport[],
  allReports: KPIReport[],
  settings: KPISettings,
  startDateStr: string,
  endDateStr: string
) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Báo Cáo Cá Nhân');

  const logoId = await getLogoId(workbook);
  if (logoId !== null) {
    worksheet.addImage(logoId, {
      tl: { col: 0, row: 0 },
      ext: { width: 80, height: 80 }
    });
  }

  worksheet.getRow(1).height = 40;
  
  worksheet.mergeCells('B1:J1');
  const titleCell = worksheet.getCell('B1');
  titleCell.value = 'HỘI XÂY DỰNG SÔNG HÀN\nBẢNG CHI TIẾT LỊCH SỬ BÁO CÁO KPI';
  titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FF0000FF' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

  worksheet.mergeCells('A3:J3');
  const infoCell1 = worksheet.getCell('A3');
  infoCell1.value = `Thành viên: ${user.representative} (${user.companyName})`;
  infoCell1.font = { name: 'Arial', size: 12, bold: true };

  worksheet.mergeCells('A4:J4');
  const infoCell2 = worksheet.getCell('A4');
  infoCell2.value = `Thời gian xuất báo cáo: Từ ngày ${startDateStr} đến ngày ${endDateStr}`;
  infoCell2.font = { name: 'Arial', size: 11, italic: true };

  const columns = [
    { header: 'Tuần', key: 'week', width: 15 },
    { header: 'Ngày báo cáo', key: 'date', width: 15 },
    { header: 'Điểm', key: 'score', width: 10 },
    { header: 'Trạng thái', key: 'status', width: 15 },
    { header: 'Hiện diện', key: 'presence', width: 15 },
    { header: 'Hiện diện (điểm)', key: 'presencePoints', width: 15 },
    { header: 'Thông tin (điểm)', key: 'info', width: 15 },
    { header: 'Cơ hội (điểm)', key: 'opp', width: 15 },
    { header: 'Khách mời (điểm)', key: 'guests', width: 15 },
    { header: 'Gặp gỡ 1-1 (điểm)', key: 'meetings', width: 15 },
    { header: 'Tiếp khách chung (điểm)', key: 'jointHosting', width: 20 },
    { header: 'Công tác chung (điểm)', key: 'jointTrip', width: 20 },
    { header: 'Văn phòng (điểm)', key: 'officeMeeting', width: 18 },
    { header: 'Doanh số cho đi (điểm)', key: 'business', width: 25 }
  ];

  const headerRow = worksheet.getRow(6);
  columns.forEach((col, idx) => {
    worksheet.getColumn(idx + 1).width = col.width;
    const cell = headerRow.getCell(idx + 1);
    cell.value = col.header;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF004080' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  });

  let currentRow = 7;
  let totalScore = 0, totalInfo = 0, totalOpp = 0, totalGuests = 0, totalMeetings = 0, totalJointHosting = 0, totalJointTrip = 0, totalOfficeMeeting = 0, totalBusiness = 0, totalPresencePoints = 0, presentCount = 0;

  userReports.forEach((report) => {
    const row = worksheet.getRow(currentRow);
    const scoreData = calculateMonthlyScore([report], allReports, settings);
    const score = scoreData.total;
    const oppPoints = ((report.internalOppCount || 0) * settings.opportunity.internal) + ((report.externalOppCount || 0) * settings.opportunity.external) + ((report.oppCount && !report.internalOppCount && !report.externalOppCount) ? report.oppCount * 4 : 0);
    const guestPoints = ((report.targetedGuests || 0) * settings.guests.targeted) + ((report.nonTargetedGuests || 0) * settings.guests.nonTargeted);
    const infoPoints = (report.infoCount || 0) * settings.info.points;
    const meetingsPoints = (report.normalMeetings || 0) * settings.oneToOne.normal;
    const jointHostingPoints = (report.jointHosting || 0) * settings.oneToOne.jointHosting;
    const jointTripPoints = (report.jointTrip || 0) * settings.oneToOne.jointTrip;
    const officeMeetingPoints = (report.officeMeeting || 0) * settings.oneToOne.officeMeeting;
    const presencePoints = scoreData.breakdown.presence;
    const businessPoints = scoreData.breakdown.business;
    
    let presenceStatusStr = 'Vắng';
    if (report.presenceStatus === 'present' && isBeforeMeetingTime(report.week, settings)) presenceStatusStr = 'Sẽ tham gia';
    else if (report.presenceStatus === 'present') presenceStatusStr = 'Có mặt';
    else if (report.presenceStatus === 'registered_present') presenceStatusStr = 'Sẽ tham gia';
    else if (report.presenceStatus === 'registered_excused') presenceStatusStr = 'Xin vắng';
    else if (report.presenceStatus === 'excused') presenceStatusStr = 'Vắng có phép';
    else if (report.presenceStatus === 'unexcused') presenceStatusStr = 'Vắng không phép';
    else if (report.presenceStatus === 'late') presenceStatusStr = 'Đi trễ';

    const values = [
      formatWeekDisplay(report.week),
      report.date?.toDate ? format(report.date.toDate(), 'dd/MM/yyyy') : format(new Date(report.date), 'dd/MM/yyyy'),
      score,
      report.status === 'approved' ? 'Đã duyệt' : report.status === 'pending' ? 'Chờ duyệt' : report.status === 'rejected' ? 'Từ chối' : 'Nghi vấn',
      presenceStatusStr,
      presencePoints,
      infoPoints, oppPoints, guestPoints, meetingsPoints, jointHostingPoints, jointTripPoints, officeMeetingPoints,
      businessPoints
    ];

    values.forEach((val, idx) => {
      const cell = row.getCell(idx + 1);
      cell.value = val;
      cell.alignment = { vertical: 'middle', horizontal: idx > 4 ? 'right' : 'center' };
      if (idx >= 12) cell.numFmt = '#,##0';
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });

    totalScore += score;
    totalInfo += infoPoints;
    totalOpp += oppPoints;
    totalGuests += guestPoints;
    totalMeetings += meetingsPoints;
    totalJointHosting += jointHostingPoints;
    totalJointTrip += jointTripPoints;
    totalOfficeMeeting += officeMeetingPoints;
    totalBusiness += businessPoints;
    totalPresencePoints += presencePoints;
    if (presenceStatusStr === 'Có mặt') presentCount++;
    currentRow++;
  });

  const summaryRow = worksheet.getRow(currentRow);
  summaryRow.getCell(1).value = 'TỔNG CỘNG THÁNG';
  summaryRow.getCell(3).value = totalScore;
  summaryRow.getCell(5).value = `${presentCount} (Có mặt)`;
  summaryRow.getCell(6).value = totalPresencePoints;
  summaryRow.getCell(7).value = totalInfo;
  summaryRow.getCell(8).value = totalOpp;
  summaryRow.getCell(9).value = totalGuests;
  summaryRow.getCell(10).value = totalMeetings;
  summaryRow.getCell(11).value = totalJointHosting;
  summaryRow.getCell(12).value = totalJointTrip;
  summaryRow.getCell(13).value = totalOfficeMeeting;
  summaryRow.getCell(14).value = totalBusiness;
  worksheet.mergeCells(`A${currentRow}:B${currentRow}`);

  for (let i = 1; i <= columns.length; i++) {
    const cell = summaryRow.getCell(i);
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
    cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    if (i >= 3) cell.alignment = { horizontal: 'right' };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const safeName = user.representative.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_');
  saveAs(new Blob([buffer]), `Bao_cao_KPI_${safeName}.xlsx`);
}

export async function exportGroupExcel(
  users: UserProfile[],
  allReports: KPIReport[],
  settings: KPISettings,
  startDateStr: string,
  endDateStr: string,
  groupFilter: number | 'all'
) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Báo Cáo Tổng Hợp');

  const logoId = await getLogoId(workbook);
  if (logoId !== null) {
    worksheet.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 80, height: 80 } });
  }

  worksheet.getRow(1).height = 40;
  
  worksheet.mergeCells('B1:J1');
  const titleCell = worksheet.getCell('B1');
  titleCell.value = 'HỘI XÂY DỰNG SÔNG HÀN\nBẢNG BÁO CÁO TỔNG HỢP THÀNH VIÊN';
  titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FF0000FF' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

  worksheet.mergeCells('A3:J3');
  const infoCell = worksheet.getCell('A3');
  infoCell.value = `Thời gian báo cáo: Từ ngày ${startDateStr} đến ngày ${endDateStr}`;
  infoCell.font = { name: 'Arial', size: 11, italic: true };

  // Calculate Aggregates
  let usersData = users.map(user => {
    const uReports = allReports.filter(r => r.userId === user.uid);
    const scoreData = calculateMonthlyScore(uReports, allReports, settings);
    const score = scoreData.total;
    const opps = uReports.reduce((s, r) => s + (r.internalOppCount || 0) + (r.externalOppCount || 0) + (r.oppCount || 0), 0);
    const giver = uReports.reduce((s, r) => s + (r.giverAmount || 0), 0);
    const presents = uReports.filter(r => r.presenceStatus === 'present' && !isBeforeMeetingTime(r.week, settings)).length;
    return { ...user, uReports, score, opps, giver, presents, scoreData };
  });

  if (groupFilter !== 'all') {
    usersData = usersData.filter(u => u.group === groupFilter);
  }

  // Highlights
  let topUser = usersData[0];
  let topGiverUser = usersData[0];
  let topOppUser = usersData[0];
  
  usersData.forEach(u => {
    if (u.score > (topUser?.score || -1)) topUser = u;
    if (u.giver > (topGiverUser?.giver || -1)) topGiverUser = u;
    if (u.opps > (topOppUser?.opps || -1)) topOppUser = u;
  });

  const groupScores: Record<number, { total: number, count: number }> = {};
  usersData.forEach(u => {
    if (u.group > 0) {
      if (!groupScores[u.group]) groupScores[u.group] = { total: 0, count: 0 };
      groupScores[u.group].total += u.score;
      groupScores[u.group].count += 1;
    }
  });

  let bestGroup = 1;
  let bestGroupAvg = -1;
  for (const [g, data] of Object.entries(groupScores)) {
    const avg = data.total / data.count;
    if (avg > bestGroupAvg) {
      bestGroupAvg = avg;
      bestGroup = Number(g);
    }
  }

  // Write Highlights
  let rowIdx = 5;
  if (groupFilter === 'all') {
    worksheet.mergeCells(`A${rowIdx}:F${rowIdx}`);
    worksheet.getCell(`A${rowIdx}`).value = `🏆 Thành viên điểm cao nhất: ${topUser?.representative || 'N/A'} (${topUser?.score || 0} điểm)`;
    worksheet.getCell(`A${rowIdx}`).font = { bold: true, color: { argb: 'FFD2691E' } };
    rowIdx++;

    worksheet.mergeCells(`A${rowIdx}:F${rowIdx}`);
    worksheet.getCell(`A${rowIdx}`).value = `💰 Thành viên cho Doanh số cao nhất: ${topGiverUser?.representative || 'N/A'} (${(topGiverUser?.giver || 0).toLocaleString()}đ)`;
    worksheet.getCell(`A${rowIdx}`).font = { bold: true, color: { argb: 'FF228B22' } };
    rowIdx++;

    worksheet.mergeCells(`A${rowIdx}:F${rowIdx}`);
    worksheet.getCell(`A${rowIdx}`).value = `🤝 Thành viên cho nhiều Cơ hội nhất: ${topOppUser?.representative || 'N/A'} (${topOppUser?.opps || 0} cơ hội)`;
    worksheet.getCell(`A${rowIdx}`).font = { bold: true, color: { argb: 'FF1E90FF' } };
    rowIdx++;

    worksheet.mergeCells(`A${rowIdx}:F${rowIdx}`);
    worksheet.getCell(`A${rowIdx}`).value = `⭐ Nhóm xuất sắc nhất: Nhóm ${bestGroup} (Trung bình ${bestGroupAvg.toFixed(1)} điểm)`;
    worksheet.getCell(`A${rowIdx}`).font = { bold: true, color: { argb: 'FFFF8C00' } };
    rowIdx++;
  }

  rowIdx++; // Empty line before table

  const columns = [
      { header: 'STT', width: 6 },
      { header: 'Thành viên', width: 25 },
      { header: 'Công ty', width: 30 },
      { header: 'Nhóm', width: 10 },
      { header: 'Tổng điểm', width: 12 },
      { header: 'Có mặt (điểm)', width: 15 },
      { header: 'Thông tin (điểm)', width: 15 },
      { header: 'Cơ hội (điểm)', width: 15 },
      { header: 'Khách mời (điểm)', width: 15 },
      { header: 'Gặp gỡ 1-1 (điểm)', width: 15 },
      { header: 'Tiếp khách chung (điểm)', width: 20 },
      { header: 'Công tác chung (điểm)', width: 20 },
      { header: 'Văn phòng (điểm)', width: 18 },
      { header: 'Doanh số cho đi (điểm)', width: 25 }
    ];

    const headerRow = worksheet.getRow(rowIdx);
    columns.forEach((col, idx) => {
      worksheet.getColumn(idx + 1).width = col.width;
      const cell = headerRow.getCell(idx + 1);
      cell.value = col.header;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF004080' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });

    rowIdx++;

    // Grouped Rendering
    const groupsToRender = groupFilter === 'all' ? [1, 2, 3, 0] : [groupFilter]; // 0 is BQT
    
    let stt = 1;
    groupsToRender.forEach(gNum => {
      const members = usersData.filter(u => u.group === gNum);
      if (members.length === 0) return;

      // Group Header
      worksheet.mergeCells(`A${rowIdx}:N${rowIdx}`);
      const groupTitle = worksheet.getCell(`A${rowIdx}`);
      const gAvg = groupScores[gNum] ? (groupScores[gNum].total / groupScores[gNum].count).toFixed(1) : 0;
      groupTitle.value = gNum === 0 ? `BAN QUẢN TRỊ` : `NHÓM ${gNum} (Điểm TB: ${gAvg})`;
      groupTitle.font = { bold: true, color: { argb: 'FF000000' } };
      groupTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE599' } };
      groupTitle.alignment = { vertical: 'middle', horizontal: 'left' };
      groupTitle.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      rowIdx++;

      members.forEach(u => {
        const row = worksheet.getRow(rowIdx);
        const rep = u.uReports;
        const values = [
          stt++,
          u.representative,
          u.companyName,
          u.group === 0 ? 'BQT' : `Nhóm ${u.group}`,
          u.score,
          u.scoreData.breakdown.presence,
          rep.reduce((s, r) => s + ((r.infoCount || 0) * settings.info.points), 0),
          rep.reduce((s, r) => s + (((r.internalOppCount || 0) * settings.opportunity.internal) + ((r.externalOppCount || 0) * settings.opportunity.external) + ((r.oppCount && !r.internalOppCount && !r.externalOppCount) ? r.oppCount * 4 : 0)), 0),
          rep.reduce((s, r) => s + (((r.targetedGuests || 0) * settings.guests.targeted) + ((r.nonTargetedGuests || 0) * settings.guests.nonTargeted)), 0),
          rep.reduce((s, r) => s + ((r.normalMeetings || 0) * settings.oneToOne.normal), 0),
          rep.reduce((s, r) => s + ((r.jointHosting || 0) * settings.oneToOne.jointHosting), 0),
          rep.reduce((s, r) => s + ((r.jointTrip || 0) * settings.oneToOne.jointTrip), 0),
          rep.reduce((s, r) => s + ((r.officeMeeting || 0) * settings.oneToOne.officeMeeting), 0),
          u.scoreData.breakdown.business
        ];

      values.forEach((val, idx) => {
        const cell = row.getCell(idx + 1);
        cell.value = val;
        cell.alignment = { vertical: 'middle', horizontal: idx >= 4 ? 'right' : 'left' };
        if (idx === 0) cell.alignment.horizontal = 'center';
        if (idx >= 13) cell.numFmt = '#,##0';
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      });
      rowIdx++;
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const nameSuffix = groupFilter === 'all' ? 'Toan_Hoi' : `Nhom_${groupFilter}`;
  saveAs(new Blob([buffer]), `Bao_cao_KPI_${nameSuffix}.xlsx`);
}
