
<html>
  <head>
    <style>
      body {
        font-family: "Helvetica Neue", helvetica, arial;
        padding: 15px;
      }
      ul {
        list-style: none;
        margin: 0;
        padding: 0;
      }
      ul li {
        line-height: 1.4;
      }
    </style>

    <script>
      var host = location.origin.replace(/^http/, 'ws')
      var ws = new WebSocket(host);
      ws.onmessage = function (event) {
        var li = document.createElement('li');
        li.innerHTML = JSON.parse(event.data);
        document.querySelector('#pings').appendChild(li);
      };
    </script>
  </head>
  <body>
    <h1>Pings</h1>
    <ul id='pings'></ul>
  </body>
</html>
