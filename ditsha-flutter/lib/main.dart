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

  Future<Map<String, dynamic>> request(String path, {String method = 'GET', Map<String, dynamic>? body}) async {
    final headers = <String, String>{'Content-Type': 'application/json'};
    if (token != null) headers['Authorization'] = 'Bearer $token';
    final uri = Uri.parse('$apiBaseUrl$path');
    final response = method == 'POST'
        ? await http.post(uri, headers: headers, body: jsonEncode(body ?? {}))
        : await http.get(uri, headers: headers);
    final decoded = response.body.isEmpty ? <String, dynamic>{} : jsonDecode(response.body) as Map<String, dynamic>;
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(decoded['message'] ?? decoded['error'] ?? 'Request failed');
    }
    return decoded;
  }
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Ditsha Citizen',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xff176c65)), useMaterial3: true),
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
      if (mounted && api.token != null) setState(() => session = {'token': api.token, 'full_name': 'Citizen'});
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
    return session == null ? AuthPage(api: api, onSignedIn: signedIn) : HomePage(api: api, session: session!, onSignOut: signOut);
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
  bool registerMode = false;
  bool busy = false;
  String? error;

  Future<void> submit() async {
    setState(() { busy = true; error = null; });
    try {
      final response = await widget.api.request(registerMode ? '/auth/citizen/register' : '/auth/citizen/login', method: 'POST', body: registerMode
          ? {'national_id': nationalId.text, 'full_name': fullName.text, 'email': email.text, 'password': password.text, 'phone': phone.text, 'district': district.text}
          : {'email': email.text, 'password': password.text});
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
      body: SafeArea(child: Center(child: SingleChildScrollView(padding: const EdgeInsets.all(24), child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 480), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Icon(Icons.landscape_rounded, size: 48, color: Color(0xffe36f46)),
        const SizedBox(height: 34),
        Text(registerMode ? 'Create your account' : 'Welcome back', style: Theme.of(context).textTheme.headlineLarge?.copyWith(fontWeight: FontWeight.w700)),
        const SizedBox(height: 8),
        Text(registerMode ? 'Start and follow your land application in one place.' : 'Track your land application with Ditsha.', style: TextStyle(color: Colors.grey.shade600)),
        const SizedBox(height: 28),
        if (registerMode) ...[
          field('Full name', fullName, Icons.person_outline),
          field('National ID', nationalId, Icons.badge_outlined),
          field('Phone', phone, Icons.phone_outlined),
          field('District', district, Icons.location_on_outlined),
        ],
        field('Email', email, Icons.email_outlined),
        field('Password', password, Icons.lock_outline, obscure: true),
        if (error != null) Padding(padding: const EdgeInsets.only(top: 14), child: Text(error!, style: const TextStyle(color: Colors.red))),
        const SizedBox(height: 22),
        SizedBox(width: double.infinity, child: FilledButton(onPressed: busy ? null : submit, child: Text(busy ? 'Please wait...' : registerMode ? 'Create account' : 'Sign in'))),
        TextButton(onPressed: busy ? null : () => setState(() { registerMode = !registerMode; error = null; }), child: Text(registerMode ? 'Already have an account? Sign in' : 'New to Ditsha? Create an account')),
        const SizedBox(height: 14),
        Text('API: $apiBaseUrl', style: TextStyle(fontSize: 11, color: Colors.grey.shade500)),
      ]))))),
    );
  }

  Widget field(String label, TextEditingController controller, IconData icon, {bool obscure = false}) => Padding(padding: const EdgeInsets.only(bottom: 14), child: TextField(controller: controller, obscureText: obscure, decoration: InputDecoration(labelText: label, prefixIcon: Icon(icon), border: const OutlineInputBorder())));
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
  final landBoardId = TextEditingController();
  final applicationId = TextEditingController();
  String applicationType = 'residential_allocation';
  Map<String, dynamic>? application;
  bool busy = false;
  String? message;
  String? error;

  Future<void> submitApplication() async {
    await runRequest(() async {
      final response = await widget.api.request('/applications', method: 'POST', body: {'application_type': applicationType, 'land_board_id': landBoardId.text, 'description': description.text});
      setState(() { application = response; message = 'Application submitted successfully.'; });
    });
  }

  Future<void> lookupApplication() async {
    await runRequest(() async {
      final response = await widget.api.request('/applications/${applicationId.text}');
      setState(() { application = response; message = 'Application status updated.'; });
    });
  }

  Future<void> runRequest(Future<void> Function() action) async {
    setState(() { busy = true; error = null; message = null; });
    try { await action(); } catch (exception) { setState(() => error = exception.toString().replaceFirst('Exception: ', '')); } finally { if (mounted) setState(() => busy = false); }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(appBar: AppBar(title: const Text('Ditsha Citizen'), actions: [IconButton(onPressed: widget.onSignOut, icon: const Icon(Icons.logout), tooltip: 'Sign out')]), body: ListView(padding: const EdgeInsets.all(20), children: [
      Text('Hello, ${widget.session['full_name'] ?? 'citizen'}', style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w700)),
      const SizedBox(height: 6),
      Text('Submit a land application or check an existing case.', style: TextStyle(color: Colors.grey.shade600)),
      const SizedBox(height: 24),
      Card(child: Padding(padding: const EdgeInsets.all(18), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [const Text('New application', style: TextStyle(fontSize: 19, fontWeight: FontWeight.bold)), const SizedBox(height: 14), DropdownButtonFormField<String>(initialValue: applicationType, decoration: const InputDecoration(labelText: 'Application type', border: OutlineInputBorder()), items: const [DropdownMenuItem(value: 'residential_allocation', child: Text('Residential allocation')), DropdownMenuItem(value: 'land_transfer', child: Text('Land transfer')), DropdownMenuItem(value: 'lease_renewal', child: Text('Lease renewal')), DropdownMenuItem(value: 'change_of_use', child: Text('Change of use'))], onChanged: busy ? null : (value) { if (value != null) setState(() => applicationType = value); }), const SizedBox(height: 12), TextField(controller: description, maxLines: 3, decoration: const InputDecoration(labelText: 'Description', hintText: 'Describe your application', border: OutlineInputBorder())), const SizedBox(height: 12), TextField(controller: landBoardId, decoration: const InputDecoration(labelText: 'Land board ID', hintText: 'Paste a land board UUID', border: OutlineInputBorder())), const SizedBox(height: 14), SizedBox(width: double.infinity, child: FilledButton(onPressed: busy ? null : submitApplication, child: const Text('Submit application')))]))),
      const SizedBox(height: 14),
      Card(child: Padding(padding: const EdgeInsets.all(18), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [const Text('Check application status', style: TextStyle(fontSize: 19, fontWeight: FontWeight.bold)), const SizedBox(height: 14), TextField(controller: applicationId, decoration: const InputDecoration(labelText: 'Application ID', border: OutlineInputBorder())), const SizedBox(height: 14), SizedBox(width: double.infinity, child: OutlinedButton(onPressed: busy ? null : lookupApplication, child: const Text('View status')))]))),
      if (busy) const Padding(padding: EdgeInsets.only(top: 18), child: Center(child: CircularProgressIndicator())),
      if (error != null) Padding(padding: const EdgeInsets.only(top: 18), child: Text(error!, style: const TextStyle(color: Colors.red))),
      if (message != null) Padding(padding: const EdgeInsets.only(top: 18), child: Text(message!, style: const TextStyle(color: Color(0xff176c65), fontWeight: FontWeight.bold))),
      if (application != null) Card(margin: const EdgeInsets.only(top: 18), color: const Color(0xffe2f1e3), child: Padding(padding: const EdgeInsets.all(18), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [const Text('Application details', style: TextStyle(fontWeight: FontWeight.bold)), const SizedBox(height: 10), Text('Reference: ${application!['reference_number'] ?? '—'}'), Text('Status: ${application!['status'] ?? '—'}'), Text('Stage: ${application!['current_stage'] ?? '—'}')]))),
    ]));
  }
}
