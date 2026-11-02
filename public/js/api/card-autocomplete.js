// 관련명함 자동완성(검색) 및 태그 추가/삭제
$(function() {
    const currentCardId = $('#current-card-id').val();
    console.log('Current Card ID:', currentCardId);

    $('#related-cards-input').autocomplete({
        minLength: 1,
        source: function(request, response) {
            const requestUrl = `/cards/api/cards/search?q=${request.term}&currentId=${currentCardId}`;
            console.log('Requesting URL:', requestUrl);

            $.getJSON(requestUrl, function(data) {
                console.log('Received data:', data);

                var selectedIds = $('#related_card_ids').val().split(',').filter(Boolean).map(Number);
                var filteredData = data.filter(function(card) {
                    return selectedIds.indexOf(card.id) === -1;
                }).map(function(card) {
                    return {
                        label: card.name + ' (' + card.company + ')',
                        value: card.name + ' (' + card.company + ')',
                        id: card.id,
                        name: card.name,
                        company: card.company
                    };
                });
                console.log('Filtered data for autocomplete:', filteredData);
                response(filteredData);
            });
        },
        select: function(event, ui) {
            console.log('Selected item:', ui.item);
            var tag = $('<span class="badge bg-info text-dark me-1 mb-1 related-card-tag" data-id="'+ui.item.id+'">'+ui.item.name+' ('+ui.item.company+') <i class="fa fa-times remove-related-card" style="cursor:pointer;"></i></span>');
            $('#related-cards-list').append(tag);
            updateRelatedCardIds();
            $(this).val('');
            return false;
        }
    });

    $('#related-cards-list').on('click', '.remove-related-card', function() {
        $(this).closest('.related-card-tag').remove();
        updateRelatedCardIds();
    });

    function updateRelatedCardIds() {
        var ids = [];
        $('#related-cards-list .related-card-tag').each(function() {
            ids.push($(this).data('id'));
        });
        $('#related_card_ids').val(ids.join(','));
        console.log('Updated related_card_ids:', $('#related_card_ids').val());
    }
});