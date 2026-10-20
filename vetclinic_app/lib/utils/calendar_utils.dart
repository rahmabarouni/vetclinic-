/// Construit un lien « Ajouter à Google Agenda » préremplissant les détails
/// d'un rendez-vous. Ouvrable dans un navigateur ou une WebView.
///
/// Format documenté :
/// https://calendar.google.com/calendar/render?action=TEMPLATE&text=...&dates=...
String buildGoogleCalendarUrl({
  required String title,
  required String details,
  required DateTime start,
  required DateTime end,
  String? location,
}) {
  String fmt(DateTime dt) {
    final iso = dt.toUtc().toIso8601String().replaceAll(RegExp(r'[-:]'), '');
    return '${iso.split('.').first}Z';
  }

  final params = <String, String>{
    'action': 'TEMPLATE',
    'text': title,
    'details': details,
    'dates': '${fmt(start)}/${fmt(end)}',
  };
  if (location != null && location.isNotEmpty) params['location'] = location;

  final query = params.entries
      .map((e) => '${Uri.encodeComponent(e.key)}=${Uri.encodeComponent(e.value)}')
      .join('&');

  return 'https://calendar.google.com/calendar/render?$query';
}
