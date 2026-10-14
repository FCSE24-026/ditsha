import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';

void main() {
  runApp(const MyApp());
}

String get apiBaseUrl {
  if (kIsWeb) return 'http://localhost:3000/api';
  return 'http://10.0.2.2:3000/api';
}

class ApiClient {
  static const storage = FlutterSecureStorage();
  String? token;

  Future<void> restoreToken() async {
    token = await storage.read(key: 'ditsha_citizen_token');
  }

  Future<void> saveToken(String value) async {
    token = value;
    await storage.write(key: 'ditsha_citizen_token', value: value);
  }

  Future<void> clearToken() async {
    token = null;
    await storage.delete(key: 'ditsha_citizen_token');
  }

  Future<Map<String, dynamic>> request(
    String path, {
    String method = 'GET',
    Map<String, dynamic>? body,
  }) async {
    final headers = <String, String>{'Content-Type': 'application/json'};
    if (token != null) headers['Authorization'] = 'Bearer $token';
    final uri = Uri.parse('$apiBaseUrl$path');

    http.Response response;
    try {
      if (method == 'POST') {
        response = await http.post(uri, headers: headers, body: jsonEncode(body ?? {})).timeout(const Duration(seconds: 10));
      } else if (method == 'PUT') {
        response = await http.put(uri, headers: headers, body: jsonEncode(body ?? {})).timeout(const Duration(seconds: 10));
      } else {
        response = await http.get(uri, headers: headers).timeout(const Duration(seconds: 10));
      }
    } catch (_) {
      throw Exception('Network error or server unavailable. Please check your connection.');
    }

    final decoded = response.body.isEmpty ? <String, dynamic>{} : jsonDecode(response.body) as Map<String, dynamic>;
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(decoded['message'] ?? decoded['error'] ?? 'Request failed (${response.statusCode})');
    }
    return decoded;
  }

  Future<Map<String, dynamic>> uploadDocument(
    String applicationId,
    String fileName,
    Uint8List bytes,
  ) async {
    final uri = Uri.parse('$apiBaseUrl/applications/$applicationId/documents');
    final request = http.MultipartRequest('POST', uri);
    if (token != null) request.headers['Authorization'] = 'Bearer $token';

    request.files.add(http.MultipartFile.fromBytes(
      'document',
      bytes,
      filename: fileName,
    ));

    try {
      final streamed = await request.send().timeout(const Duration(seconds: 15));
      final response = await http.Response.fromStream(streamed);
      final decoded = jsonDecode(response.body) as Map<String, dynamic>;
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw Exception(decoded['message'] ?? 'Document upload failed');
      }
      return decoded;
    } catch (e) {
      if (e is Exception) rethrow;
      throw Exception('Upload error: $e');
    }
  }
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Ditsha Citizen',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xff176c65)),
        useMaterial3: true,
      ),
      home: const CitizenApp(),
    );
  }
}

class CitizenApp extends StatefulWidget {
  const CitizenApp({super.key});

  @override
  State<CitizenApp> createState() => _CitizenAppState();
}

class _CitizenAppState extends State<CitizenApp> {
  final ApiClient api = ApiClient();
  Map<String, dynamic>? session;

  @override
  void initState() {
    super.initState();
    api.restoreToken().then((_) {
      if (mounted && api.token != null) {
        setState(() => session = {'token': api.token, 'full_name': 'Citizen'});
      }
    });
  }

  void signedIn(Map<String, dynamic> response) {
    setState(() {
      session = response;
    });
    api.saveToken(response['token'] as String);
  }

  void signOut() {
    setState(() {
      session = null;
    });
    api.clearToken();
  }

  @override
  Widget build(BuildContext context) {
    return session == null
        ? AuthPage(api: api, onSignedIn: signedIn)
        : HomePage(api: api, session: session!, onSignOut: signOut);
  }
}

class AuthPage extends StatefulWidget {
  const AuthPage({super.key, required this.api, required this.onSignedIn});
  final ApiClient api;
  final ValueChanged<Map<String, dynamic>> onSignedIn;

  @override
  State<AuthPage> createState() => _AuthPageState();
}

class _AuthPageState extends State<AuthPage> {
  final email = TextEditingController(text: 'citizen@example.com');
  final password = TextEditingController(text: 'CitizenPass123!');
  final nationalId = TextEditingController();
  final fullName = TextEditingController();
  final phone = TextEditingController();
  final district = TextEditingController(text: 'Gaborone');

  // Password Reset controllers
  final resetEmail = TextEditingController();
  final resetToken = TextEditingController();
  final newPassword = TextEditingController();

  bool registerMode = false;
  bool resetMode = false;
  bool resetTokenIssued = false;
  bool busy = false;
  String? error;
  String? infoMessage;

  Future<void> submit() async {
    setState(() {
      busy = true;
      error = null;
      infoMessage = null;
    });
    try {
      if (resetMode) {
        if (!resetTokenIssued) {
          final res = await widget.api.request('/auth/citizen/password-reset/request', method: 'POST', body: {'email': resetEmail.text.trim()});
          setState(() {
            resetTokenIssued = true;
            infoMessage = res['message'] ?? 'Reset instructions issued.';
          });
        } else {
          final res = await widget.api.request('/auth/citizen/password-reset/complete', method: 'POST', body: {
            'token': resetToken.text.trim(),
            'password': newPassword.text,
          });
          setState(() {
            resetMode = false;
            resetTokenIssued = false;
            infoMessage = '${res['message']}. Please sign in with your new password.';
          });
        }
        return;
      }

      final response = await widget.api.request(
        registerMode ? '/auth/citizen/register' : '/auth/citizen/login',
        method: 'POST',
        body: registerMode
            ? {
                'national_id': nationalId.text.trim(),
                'full_name': fullName.text.trim(),
                'email': email.text.trim(),
                'password': password.text,
                'phone': phone.text.trim(),
                'district': district.text.trim(),
              }
            : {'email': email.text.trim(), 'password': password.text},
      );
      widget.onSignedIn(response);
    } catch (exception) {
      setState(() => error = exception.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 480),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(Icons.landscape_rounded, size: 48, color: Color(0xffe36f46)),
                  const SizedBox(height: 28),
                  Text(
                    resetMode
                        ? (resetTokenIssued ? 'Complete Password Reset' : 'Reset Password')
                        : (registerMode ? 'Create your account' : 'Welcome back'),
                    style: Theme.of(context).textTheme.headlineLarge?.copyWith(fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    resetMode
                        ? 'Recover access to your Ditsha account.'
                        : (registerMode
                            ? 'Start and follow your land application in one place.'
                            : 'Track your land application with Ditsha.'),
                    style: TextStyle(color: Colors.grey.shade600),
                  ),
                  const SizedBox(height: 24),
                  if (infoMessage != null)
                    Container(
                      padding: const EdgeInsets.all(12),
                      margin: const EdgeInsets.only(bottom: 16),
                      decoration: BoxDecoration(color: const Color(0xffe2f1e3), borderRadius: BorderRadius.circular(8)),
                      child: Text(infoMessage!, style: const TextStyle(color: Color(0xff1b5e20), fontWeight: FontWeight.bold)),
                    ),
                  if (resetMode) ...[
                    if (!resetTokenIssued) ...[
                      field('Registered Email', resetEmail, Icons.email_outlined),
                    ] else ...[
                      field('Reset Token', resetToken, Icons.key_outlined),
                      field('New Password (min 10 chars)', newPassword, Icons.lock_outline, obscure: true),
                    ],
                  ] else ...[
                    if (registerMode) ...[
                      field('Full name', fullName, Icons.person_outline),
                      field('National ID', nationalId, Icons.badge_outlined),
                      field('Phone', phone, Icons.phone_outlined),
                      field('District', district, Icons.location_on_outlined),
                    ],
                    field('Email', email, Icons.email_outlined),
                    field('Password', password, Icons.lock_outline, obscure: true),
                  ],
                  if (error != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 8, bottom: 8),
                      child: Text(error!, style: const TextStyle(color: Colors.red)),
                    ),
                  const SizedBox(height: 16),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      onPressed: busy ? null : submit,
                      child: Text(
                        busy
                            ? 'Please wait...'
                            : (resetMode
                                ? (resetTokenIssued ? 'Update password' : 'Send reset link')
                                : (registerMode ? 'Create account' : 'Sign in')),
                      ),
                    ),
                  ),
                  const SizedBox(height: 10),
                  if (!resetMode) ...[
                    TextButton(
                      onPressed: busy
                          ? null
                          : () => setState(() {
                                registerMode = !registerMode;
                                error = null;
                                infoMessage = null;
                              }),
                      child: Text(
                        registerMode
                            ? 'Already have an account? Sign in'
                            : 'New to Ditsha? Create an account',
                      ),
                    ),
                    TextButton(
                      onPressed: busy
                          ? null
                          : () => setState(() {
                                resetMode = true;
                                resetTokenIssued = false;
                                error = null;
                                infoMessage = null;
                              }),
                      child: const Text('Forgot password?'),
                    ),
                  ] else ...[
                    TextButton(
                      onPressed: busy
                          ? null
                          : () => setState(() {
                                resetMode = false;
                                resetTokenIssued = false;
                                error = null;
                                infoMessage = null;
                              }),
                      child: const Text('Back to Sign in'),
                    ),
                  ],
                  const SizedBox(height: 12),
                  Text('API: $apiBaseUrl', style: TextStyle(fontSize: 11, color: Colors.grey.shade500)),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget field(String label, TextEditingController controller, IconData icon, {bool obscure = false}) => Padding(
        padding: const EdgeInsets.only(bottom: 14),
        child: TextField(
          controller: controller,
          obscureText: obscure,
          decoration: InputDecoration(
            labelText: label,
            prefixIcon: Icon(icon),
            border: const OutlineInputBorder(),
          ),
        ),
      );
}

class HomePage extends StatefulWidget {
  const HomePage({super.key, required this.api, required this.session, required this.onSignOut});
  final ApiClient api;
  final Map<String, dynamic> session;
  final VoidCallback onSignOut;

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  final description = TextEditingController();
  final applicationId = TextEditingController();
  final responseText = TextEditingController();
  final editName = TextEditingController();
  final editPhone = TextEditingController();
  final editDistrict = TextEditingController();

  String applicationType = 'residential_allocation';
  List<Map<String, dynamic>> landBoards = [];
  String? selectedLandBoardId;

  Map<String, dynamic>? application;
  List<Map<String, dynamic>> applications = [];
  List<Map<String, dynamic>> drafts = [];
  List<Map<String, dynamic>> notifications = [];
  Map<String, dynamic>? citizenProfile;

  bool busy = false;
  String? message;
  String? error;
  int currentTabIndex = 0;

  @override
  void initState() {
    super.initState();
    loadAll();
  }

  Future<void> loadAll() async {
    await Future.wait([
      loadLandBoards(),
      loadCitizenData(),
      loadProfile(),
      loadDrafts(),
    ]);
  }

  Future<void> loadProfile() async {
    try {
      final res = await widget.api.request('/auth/citizen/me');
      if (mounted) {
        setState(() {
          citizenProfile = res['citizen'] as Map<String, dynamic>?;
          editName.text = citizenProfile?['full_name'] ?? '';
          editPhone.text = citizenProfile?['phone'] ?? '';
          editDistrict.text = citizenProfile?['district'] ?? '';
        });
      }
    } catch (_) {}
  }

  Future<void> updateProfile() async {
    await runRequest(() async {
      final res = await widget.api.request('/auth/citizen/me', method: 'PUT', body: {
        'full_name': editName.text.trim(),
        'phone': editPhone.text.trim(),
        'district': editDistrict.text.trim(),
      });
      setState(() {
        citizenProfile = res['citizen'] as Map<String, dynamic>?;
        message = 'Profile updated successfully.';
      });
    });
  }

  Future<void> loadDrafts() async {
    try {
      final res = await widget.api.request('/applications/drafts');
      if (mounted) {
        setState(() {
          drafts = List<Map<String, dynamic>>.from(res['drafts'] ?? const []);
        });
      }
    } catch (_) {}
  }

  Future<void> loadCitizenData() async {
    try {
      final results = await Future.wait([
        widget.api.request('/applications'),
        widget.api.request('/notifications'),
      ]);
      if (!mounted) return;
      setState(() {
        applications = List<Map<String, dynamic>>.from(results[0]['applications'] ?? const []);
        notifications = List<Map<String, dynamic>>.from(results[1]['notifications'] ?? const []);
      });
    } catch (exception) {
      if (mounted) setState(() => error = exception.toString().replaceFirst('Exception: ', ''));
    }
  }

  Future<void> loadLandBoards() async {
    try {
      final response = await widget.api.request('/land-boards');
      if (!mounted) return;
      setState(() {
        landBoards = List<Map<String, dynamic>>.from(response['land_boards'] ?? const []);
        selectedLandBoardId = landBoards.isNotEmpty ? landBoards.first['land_board_id'] as String : null;
      });
    } catch (exception) {
      if (mounted) setState(() => error = exception.toString().replaceFirst('Exception: ', ''));
    }
  }

  Future<void> saveDraft() async {
    await runRequest(() async {
      final response = await widget.api.request('/applications/draft', method: 'POST', body: {
        'application_type': applicationType,
        'land_board_id': selectedLandBoardId,
        'description': description.text,
      });
      setState(() {
        message = response['message'] ?? 'Draft saved.';
      });
      await loadDrafts();
    });
  }

  Future<void> submitApplication({String? fromDraftId}) async {
    await runRequest(() async {
      if (selectedLandBoardId == null) throw Exception('Select a land board');
      final body = <String, dynamic>{
        'application_type': applicationType,
        'land_board_id': selectedLandBoardId,
        'description': description.text,
      };
      if (fromDraftId != null) body['application_id'] = fromDraftId;

      final response = await widget.api.request('/applications', method: 'POST', body: body);
      setState(() {
        application = response;
        message = 'Application submitted successfully. Ref: ${response['reference_number']}';
      });
      await loadCitizenData();
      await loadDrafts();
    });
  }

  Future<void> lookupApplication([String? idToLookup]) async {
    final targetId = idToLookup ?? applicationId.text.trim();
    if (targetId.isEmpty) return;
    await runRequest(() async {
      final response = await widget.api.request('/applications/$targetId');
      setState(() {
        application = response;
        message = 'Application status updated.';
      });
    });
  }

  Future<void> uploadSampleDocument(String docType) async {
    if (application == null) return;
    final appId = application!['application_id'] as String;
    await runRequest(() async {
      const samplePdfContent = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000052 00000 n\n0000000102 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n178\n%%EOF';
      final bytes = Uint8List.fromList(samplePdfContent.codeUnits);
      final filename = '${docType}_sample.pdf';

      await widget.api.uploadDocument(appId, filename, bytes);
      setState(() {
        message = 'Document $filename uploaded and verified successfully.';
      });
      await lookupApplication(appId);
    });
  }

  Future<void> respondToInformationRequest() async {
    if (application == null) return;
    final appId = application!['application_id'] as String;
    if (responseText.text.trim().length < 5) {
      setState(() => error = 'Please enter an explanation of at least 5 characters');
      return;
    }
    await runRequest(() async {
      await widget.api.request('/applications/$appId/respond', method: 'POST', body: {
        'notes': responseText.text.trim(),
      });
      responseText.clear();
      setState(() {
        message = 'Response submitted. Application is now under review.';
      });
      await lookupApplication(appId);
      await loadCitizenData();
    });
  }

  Future<void> withdrawApplication() async {
    if (application == null) return;
    final appId = application!['application_id'] as String;
    await runRequest(() async {
      await widget.api.request('/applications/$appId/withdraw', method: 'POST', body: {
        'reason': 'Withdrawn by applicant request.',
      });
      setState(() {
        message = 'Application has been withdrawn.';
      });
      await lookupApplication(appId);
      await loadCitizenData();
    });
  }

  Future<void> markNotificationRead(String notifId) async {
    try {
      await widget.api.request('/notifications/$notifId/read', method: 'POST');
      await loadCitizenData();
    } catch (_) {}
  }

  Future<void> runRequest(Future<void> Function() action) async {
    setState(() {
      busy = true;
      error = null;
      message = null;
    });
    try {
      await action();
    } catch (exception) {
      setState(() => error = exception.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Ditsha Citizen'),
        actions: [
          IconButton(onPressed: loadAll, icon: const Icon(Icons.refresh), tooltip: 'Refresh data'),
          IconButton(onPressed: widget.onSignOut, icon: const Icon(Icons.logout), tooltip: 'Sign out'),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: currentTabIndex,
        onDestinationSelected: (idx) => setState(() => currentTabIndex = idx),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.description_outlined), label: 'Applications'),
          NavigationDestination(icon: Icon(Icons.add_box_outlined), label: 'New Draft'),
          NavigationDestination(icon: Icon(Icons.notifications_outlined), label: 'Notifications'),
          NavigationDestination(icon: Icon(Icons.person_outline), label: 'Profile'),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text(
            'Hello, ${citizenProfile?['full_name'] ?? widget.session['full_name'] ?? 'citizen'}',
            style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 6),
          Text('Submit a land application or check an existing case.', style: TextStyle(color: Colors.grey.shade600)),
          const SizedBox(height: 20),
          if (busy) const Padding(padding: EdgeInsets.symmetric(vertical: 10), child: LinearProgressIndicator()),
          if (error != null)
            Container(
              padding: const EdgeInsets.all(12),
              margin: const EdgeInsets.only(bottom: 14),
              decoration: BoxDecoration(color: const Color(0xfffbe7df), borderRadius: BorderRadius.circular(8)),
              child: Text(error!, style: const TextStyle(color: Color(0xff9e3728))),
            ),
          if (message != null)
            Container(
              padding: const EdgeInsets.all(12),
              margin: const EdgeInsets.only(bottom: 14),
              decoration: BoxDecoration(color: const Color(0xffe2f1e3), borderRadius: BorderRadius.circular(8)),
              child: Text(message!, style: const TextStyle(color: Color(0xff1b5e20), fontWeight: FontWeight.bold)),
            ),

          if (currentTabIndex == 0) ...[
            // Status Check Card
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Check application status', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 10),
                    TextField(
                      controller: applicationId,
                      decoration: const InputDecoration(labelText: 'Application ID or Reference', border: OutlineInputBorder()),
                    ),
                    const SizedBox(height: 10),
                    SizedBox(
                      width: double.infinity,
                      child: OutlinedButton(
                        onPressed: busy ? null : () => lookupApplication(),
                        child: const Text('View status'),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 14),

            // New Application Card
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('New application', style: TextStyle(fontSize: 19, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 12),
                    DropdownButtonFormField<String>(
                      initialValue: applicationType,
                      decoration: const InputDecoration(labelText: 'Application type', border: OutlineInputBorder()),
                      items: const [
                        DropdownMenuItem(value: 'residential_allocation', child: Text('Residential allocation')),
                        DropdownMenuItem(value: 'land_transfer', child: Text('Land transfer')),
                        DropdownMenuItem(value: 'lease_renewal', child: Text('Lease renewal')),
                        DropdownMenuItem(value: 'change_of_use', child: Text('Change of use')),
                      ],
                      onChanged: busy ? null : (value) { if (value != null) setState(() => applicationType = value); },
                    ),
                    const SizedBox(height: 10),
                    DropdownButtonFormField<String>(
                      initialValue: selectedLandBoardId,
                      decoration: const InputDecoration(labelText: 'Land board', border: OutlineInputBorder()),
                      items: landBoards
                          .map((board) => DropdownMenuItem<String>(
                                value: board['land_board_id'] as String,
                                child: Text('${board['name']} (${board['region']})'),
                              ))
                          .toList(),
                      onChanged: busy ? null : (value) => setState(() => selectedLandBoardId = value),
                    ),
                    const SizedBox(height: 10),
                    TextField(
                      controller: description,
                      maxLines: 2,
                      decoration: const InputDecoration(labelText: 'Description', hintText: 'Describe your land request...', border: OutlineInputBorder()),
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton(
                            onPressed: busy ? null : saveDraft,
                            child: const Text('Save draft'),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: FilledButton(
                            onPressed: busy || landBoards.isEmpty ? null : () => submitApplication(),
                            child: const Text('Submit application'),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),

            // Active Application Detail
            if (application != null)
              Card(
                color: const Color(0xfffdfcf9),
                elevation: 2,
                child: Padding(
                  padding: const EdgeInsets.all(18),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Expanded(
                            child: Text(
                              'Reference: ${application!['reference_number'] ?? '—'}',
                              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: Color(0xff176c65)),
                            ),
                          ),
                          Chip(
                            label: Text(
                              (application!['status'] ?? application!['current_status'] ?? '').toString().replaceAll('_', ' '),
                              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text('Stage: ${application!['current_stage'] ?? '—'}'),
                      Text('Type: ${application!['application_type']?.toString().replaceAll('_', ' ') ?? '—'}'),
                      if (application!['description'] != null) Text('Description: ${application!['description']}'),
                      const Divider(height: 24),

                      // Information requested notice & response form
                      if ((application!['status'] ?? application!['current_status']) == 'information_requested') ...[
                        Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(color: const Color(0xfff4ecf7), borderRadius: BorderRadius.circular(8)),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Row(
                                children: [
                                  Icon(Icons.info_outline, color: Color(0xff8e44ad)),
                                  SizedBox(width: 8),
                                  Text('Action Required: Information Requested', style: TextStyle(fontWeight: FontWeight.bold, color: Color(0xff8e44ad))),
                                ],
                              ),
                              const SizedBox(height: 8),
                              const Text('Please provide the requested details or supporting documents below to continue review.'),
                              const SizedBox(height: 10),
                              TextField(
                                controller: responseText,
                                maxLines: 2,
                                decoration: const InputDecoration(labelText: 'Your response message', border: OutlineInputBorder()),
                              ),
                              const SizedBox(height: 10),
                              FilledButton(
                                onPressed: busy ? null : respondToInformationRequest,
                                child: const Text('Submit Response & Resume Review'),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 16),
                      ],

                      // Upload Document Section
                      const Text('Upload Supporting Document', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8,
                        children: [
                          ActionChip(
                            avatar: const Icon(Icons.upload_file, size: 16),
                            label: const Text('Upload ID Document'),
                            onPressed: busy ? null : () => uploadSampleDocument('identity_document'),
                          ),
                          ActionChip(
                            avatar: const Icon(Icons.upload_file, size: 16),
                            label: const Text('Upload Proof of Residence'),
                            onPressed: busy ? null : () => uploadSampleDocument('proof_of_residence'),
                          ),
                        ],
                      ),
                      const SizedBox(height: 14),

                      // Uploaded documents list
                      if (application!['documents'] != null && (application!['documents'] as List).isNotEmpty) ...[
                        const Text('Uploaded Documents:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                        const SizedBox(height: 6),
                        ...(application!['documents'] as List).map((doc) => ListTile(
                              dense: true,
                              contentPadding: EdgeInsets.zero,
                              leading: const Icon(Icons.file_present_outlined, color: Color(0xff176c65)),
                              title: Text(doc['original_name']?.toString() ?? 'Document'),
                              subtitle: Text('${doc['content_type']} · ${doc['scan_status']}'),
                            )),
                      ],

                      // Event timeline
                      if (application!['events'] != null && (application!['events'] as List).isNotEmpty) ...[
                        const Divider(height: 20),
                        const Text('Status Timeline:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                        const SizedBox(height: 6),
                        ...(application!['events'] as List).map((ev) => Padding(
                              padding: const EdgeInsets.symmetric(vertical: 4),
                              child: Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const Icon(Icons.circle, size: 8, color: Color(0xff176c65)),
                                  const SizedBox(width: 8),
                                  Expanded(
                                    child: Text(
                                      '${ev['event_type']?.toString().replaceAll('_', ' ')}: ${ev['notes'] ?? ''}',
                                      style: const TextStyle(fontSize: 12),
                                    ),
                                  ),
                                ],
                              ),
                            )),
                      ],

                      const Divider(height: 20),
                      if (!['approved', 'rejected', 'withdrawn'].contains(application!['status'] ?? application!['current_status']))
                        OutlinedButton.icon(
                          onPressed: busy ? null : withdrawApplication,
                          icon: const Icon(Icons.cancel_outlined, color: Colors.red, size: 16),
                          label: const Text('Withdraw Application', style: TextStyle(color: Colors.red)),
                        ),
                    ],
                  ),
                ),
              ),
            const SizedBox(height: 16),

            // Applications List
            if (applications.isNotEmpty)
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(18),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('My applications', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                      const SizedBox(height: 8),
                      ...applications.map((item) => ListTile(
                            contentPadding: EdgeInsets.zero,
                            title: Text(item['reference_number']?.toString() ?? 'Application', style: const TextStyle(fontWeight: FontWeight.bold)),
                            subtitle: Text('${item['application_type']?.toString().replaceAll('_', ' ')} · ${item['land_board_name'] ?? ''}'),
                            trailing: Chip(
                              label: Text(
                                (item['status'] ?? item['current_status'] ?? '').toString().replaceAll('_', ' '),
                                style: const TextStyle(fontSize: 11),
                              ),
                            ),
                            onTap: () => lookupApplication(item['application_id'] as String),
                          )),
                    ],
                  ),
                ),
              ),

            // Drafts List
            if (drafts.isNotEmpty) ...[
              const SizedBox(height: 16),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(18),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Saved Drafts', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                      const SizedBox(height: 8),
                      ...drafts.map((d) => ListTile(
                            contentPadding: EdgeInsets.zero,
                            title: Text(d['reference_number']?.toString() ?? 'Draft', style: const TextStyle(fontWeight: FontWeight.bold)),
                            subtitle: Text(d['application_type']?.toString().replaceAll('_', ' ') ?? 'Residential'),
                            trailing: TextButton(
                              onPressed: busy ? null : () => submitApplication(fromDraftId: d['application_id'] as String),
                              child: const Text('Submit Now'),
                            ),
                          )),
                    ],
                  ),
                ),
              ),
            ],
          ] else if (currentTabIndex == 1) ...[
            // New Application / Draft Card
            Card(
              child: Padding(
                padding: const EdgeInsets.all(18),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('New application', style: TextStyle(fontSize: 19, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 14),
                    DropdownButtonFormField<String>(
                      initialValue: applicationType,
                      decoration: const InputDecoration(labelText: 'Application type', border: OutlineInputBorder()),
                      items: const [
                        DropdownMenuItem(value: 'residential_allocation', child: Text('Residential allocation')),
                        DropdownMenuItem(value: 'land_transfer', child: Text('Land transfer')),
                        DropdownMenuItem(value: 'lease_renewal', child: Text('Lease renewal')),
                        DropdownMenuItem(value: 'change_of_use', child: Text('Change of use')),
                      ],
                      onChanged: busy ? null : (value) => setState(() => applicationType = value ?? 'residential_allocation'),
                    ),
                    const SizedBox(height: 12),
                    DropdownButtonFormField<String>(
                      initialValue: selectedLandBoardId,
                      decoration: const InputDecoration(labelText: 'Land board', border: OutlineInputBorder()),
                      items: landBoards
                          .map((board) => DropdownMenuItem<String>(
                                value: board['land_board_id'] as String,
                                child: Text('${board['name']} (${board['region']})'),
                              ))
                          .toList(),
                      onChanged: busy ? null : (value) => setState(() => selectedLandBoardId = value),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: description,
                      maxLines: 3,
                      decoration: const InputDecoration(labelText: 'Description', hintText: 'Describe your land request...', border: OutlineInputBorder()),
                    ),
                    const SizedBox(height: 14),
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton(
                            onPressed: busy ? null : saveDraft,
                            child: const Text('Save as Draft'),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: FilledButton(
                            onPressed: busy || landBoards.isEmpty ? null : () => submitApplication(),
                            child: const Text('Submit application'),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ] else if (currentTabIndex == 2) ...[
            // Notifications List
            Card(
              child: Padding(
                padding: const EdgeInsets.all(18),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Notifications', style: TextStyle(fontSize: 19, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 10),
                    if (notifications.isEmpty)
                      const Text('No notifications yet.', style: TextStyle(color: Colors.grey))
                    else
                      ...notifications.map((item) {
                        final isRead = item['read_at'] != null;
                        return ListTile(
                          contentPadding: EdgeInsets.zero,
                          leading: Icon(
                            isRead ? Icons.mark_email_read_outlined : Icons.mark_email_unread_rounded,
                            color: isRead ? Colors.grey : const Color(0xff176c65),
                          ),
                          title: Text(item['title']?.toString() ?? 'Notification', style: TextStyle(fontWeight: isRead ? FontWeight.normal : FontWeight.bold)),
                          subtitle: Text(item['body']?.toString() ?? ''),
                          trailing: isRead
                              ? null
                              : TextButton(
                                  onPressed: () => markNotificationRead(item['notification_id'] as String),
                                  child: const Text('Mark Read'),
                                ),
                        );
                      }),
                  ],
                ),
              ),
            ),
          ] else if (currentTabIndex == 3) ...[
            // Profile Card
            Card(
              child: Padding(
                padding: const EdgeInsets.all(18),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Citizen Profile', style: TextStyle(fontSize: 19, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 14),
                    Text('National ID: ${citizenProfile?['national_id'] ?? '—'}', style: const TextStyle(fontWeight: FontWeight.bold)),
                    Text('Email: ${citizenProfile?['email'] ?? '—'}'),
                    const SizedBox(height: 16),
                    TextField(controller: editName, decoration: const InputDecoration(labelText: 'Full name', border: OutlineInputBorder())),
                    const SizedBox(height: 12),
                    TextField(controller: editPhone, decoration: const InputDecoration(labelText: 'Phone', border: OutlineInputBorder())),
                    const SizedBox(height: 12),
                    TextField(controller: editDistrict, decoration: const InputDecoration(labelText: 'District', border: OutlineInputBorder())),
                    const SizedBox(height: 16),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton(
                        onPressed: busy ? null : updateProfile,
                        child: const Text('Save Profile Changes'),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
