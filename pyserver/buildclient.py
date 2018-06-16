# Tilemap Town
# Copyright (C) 2017 NovaSquirrel
#
# This program is free software: you can redistribute it and/or
# modify it under the terms of the GNU General Public License as
# published by the Free Software Foundation; either version 3 of the
# License, or (at your option) any later version.
#
# This program is distributed in the hope that it will be useful, but
# WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
# General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program.  If not, see <http://www.gnu.org/licenses/>.

import asyncio, datetime, random, websockets, json, os.path, hashlib
from buildglobal import *

# Make a command to send
def makeCommand(commandType, commandParams):
	if commandParams != None:
		return commandType + " " + json.dumps(commandParams)
	else:
		return commandType

userCounter = 1

class Client(object):
	def __init__(self,websocket):
		global userCounter
		self.ws = websocket
		self.name = 'Guest '+ str(userCounter)
		self.x = 0
		self.y = 0
		self.map = None
		self.map_id = -1
		self.pic = [0, 2, 25]
		self.id = userCounter
		self.ping_timer = 180
		self.inventory = []
		userCounter += 1

		# other user info
		self.server_admin = False
		self.ignore_list = []
		self.watch_list = []
		self.tags = {}    # description, species, gender and other things
		self.away = False # true, or a string if person is away

		self.requests = {} # indexed by username, array with [timer, type]

		# account stuff
		self.username = None
		self.password = None # actually the password hash

	def send(self, commandType, commandParams):
		""" Send a command to the client """
		asyncio.ensure_future(self.ws.send(makeCommand(commandType, commandParams)))

	def failedToFind(self, username):
		if username == None or len(username) == 0:
			self.send("ERR", {'text': 'No username given'})
		else:
			self.send("ERR", {'text': 'Player '+username+' not found'})

	def who(self):
		""" A dictionary of information for the WHO command """
		return {'name': self.name, 'pic': self.pic, 'x': self.x, 'y': self.y, 'id': self.id, 'username': self.username}

	def disconnect(self):
		asyncio.ensure_future(self.ws.close())

	def usernameOrId(self):
		return self.username or str(self.id)

	def nameAndUsername(self):
		return '%s (%s)' % (self.name, self.usernameOrId())

	def set_tag(self, name, value):
		self.tags[name] = value

	def get_tag(self, name, default=None):
		if name in self.tags:
			return self.tags[name]
		return default

	def save(self):
		""" Save user information to a file """
		name = "users/"+str(self.username)+".txt";
		try:
			with open(name, 'w') as f:
				f.write("PASS\n")
				f.write(json.dumps({'sha512':self.password})+"\n")
				f.write("WHO\n")
				who = self.who()
				who["map_id"] = self.map.id # add the map ID
				f.write(json.dumps(who)+"\n")
				f.write("TAGS\n")
				f.write(json.dumps(self.tags)+"\n")
				f.write("IGNORE\n")
				f.write(json.dumps(self.ignore_list)+"\n")
				f.write("WATCH\n")
				f.write(json.dumps(self.watch_list)+"\n")
				if self.server_admin:
					f.write("ADMIN\n");
		except:
			print("Couldn't save user "+name)

	def switch_map(self, map_id):
		""" Teleport the user to another map """
		if self.map and self.map.id == map_id:
			return

		if self.map:
			# Remove the user for everyone on the map
			self.map.users.remove(self)
			self.map.broadcast("WHO", {'remove': self.id})

		# Get the new map and send it to the client
		self.map_id = map_id
		self.map = getMapById(map_id)
		self.send("MAI", self.map.map_info())
		self.send("MAP", self.map.map_section(0, 0, self.map.width-1, self.map.height-1))
		self.map.users.add(self)
		self.send("WHO", {'list': self.map.who(), 'you': self.id})

		# Tell everyone on the new map the user arrived
		self.map.broadcast("WHO", {'add': self.who()})

	def login(self, username, password):
		""" Attempt to log the client into an account """
		result = self.load(username, password)
		if result == True:
			self.switch_map(self.map_id)
			self.map.broadcast("MSG", {'text': self.name+" has logged in ("+self.username+")"})
			self.map.broadcast("WHO", {'add': self.who()}) # update client view
			return True
		elif result == False:
			self.send("ERR", {'text': 'Login fail, bad password for account'})
		else:
			self.send("ERR", {'text': 'Login fail, nonexistent account'})
		return False

	def changepass(self, password):
		self.password = hashlib.sha512(password.encode()).hexdigest()
		self.save()

	def register(self, username, password):
		if os.path.isfile("users/"+str(username)+".txt"):
			return False
		self.username = username
		self.changepass(password)
		return True

	def load(self, username, password):
		password = hashlib.sha512(password.encode()).hexdigest()

		name = "users/"+str(username)+".txt";
		try:
			with open(name, 'r') as f:
				lines = f.readlines()
				iswho = False
				ispass = False
				istags = False
				isignore = False
				iswatch = False
				for line in lines:
					if line == "PASS\n":
						ispass = True
					elif line == "WHO\n":
						iswho = True
					elif line == "TAGS\n":
						istags = True
					elif line == "IGNORE\n":
						isignore = True
					elif line == "WATCH\n":
						iswatch = True
					elif line == "ADMIN\n":
						self.server_admin = True
					elif iswho:
						s = json.loads(line)
						self.name = s["name"]
						self.pic = s["pic"]
						self.x = s["x"]
						self.y = s["y"]
						self.map_id = s["map_id"]
						iswho = False
					elif ispass:
						s = json.loads(line)
						if "sha512" in s:
							if s["sha512"] != password:
								return False
						ispass = False
					elif istags:
						self.tags = json.loads(line)
						istags = False
					elif isignore:
						self.ignore_list = json.loads(line)
						isignore = False
					elif iswatch:
						self.watch_list = json.loads(line)
						iswatch = False
				self.username = username
				self.password = password
				return True
		except:
			print("Couldn't load user "+name)
			return None
