$(async function () {
    const service = new AdminDataService();

    async function load() {
        const tableBody = $('#adminTableBody');
        tableBody.html('<tr><td colspan="4" class="text-center text-muted">Loading...</td></tr>');
        try {
            const all = await service.getAllProgress();
            const users = Object.keys(all || {}).sort((a, b) => a.localeCompare(b));

            // Stats
            const totalUsers = users.length;
            const usersWithBingo = users.filter(u => (all[u]?.bingoCount || 0) > 0).length;
            const totalBingos = users.reduce((acc, u) => acc + (all[u]?.bingoCount || 0), 0);
            $('#statTotalUsers').text(totalUsers);
            $('#statUsersWithBingo').text(usersWithBingo);
            $('#statTotalBingos').text(totalBingos);

            if (!users.length) {
                tableBody.html('<tr><td colspan="4" class="text-center text-muted">No data yet</td></tr>');
                $('#notesViewer').html('<div class="no-winners">Select a row to view notes</div>');
                $('#selectedUser').text('');
                return;
            }

            tableBody.empty();
            users.forEach(name => {
                const s = all[name] || {};
                const completed = Array.isArray(s.selectedCells) ? s.selectedCells.length : 0;
                const notesArr = s.notesByIndex ? Object.entries(s.notesByIndex) : [];
                const lastSynced = s.lastSynced ? new Date(s.lastSynced).toLocaleString() : '—';

                const row = $(`
                    <tr>
                        <td>${name}</td>
                        <td><span class="badge-soft-primary">${s.bingoCount || 0}</span></td>
                        <td>${completed}</td>
                        <td>${lastSynced}</td>
                    </tr>
                `);
                // Click to preview notes on the right panel
                row.on('click', function () {
                    $('#selectedUser').text(name);
                    const list = s.notesByIndex ? Object.entries(s.notesByIndex) : [];
                    if (!list.length) {
                        $('#notesViewer').html('<div class="no-winners">No notes for this user</div>');
                    } else {
                        const html = list.map(([idx, text]) => `
                            <div class="note-item mb-2">
                                <div class="small text-muted mb-1">Cell #${Number(idx) + 1}: ${$('<div>').text((s.tasks && s.tasks[Number(idx)]) || '').html()}</div>
                                <div class="note-text">${$('<div>').text(text).html()}</div>
                            </div>
                        `).join('');
                        $('#notesViewer').html(html);
                    }
                });
                tableBody.append(row);
            });
            $('#selectedUser').text(users[0]);
            $('tbody#adminTableBody tr').first().trigger('click');
        } catch (e) {
            console.error('Admin load error:', e);
            tableBody.html('<tr><td colspan="4" class="text-center text-danger">Failed to load</td></tr>');
        }
    }

    $('#refreshAdmin').on('click', load);
    await load();
});


